
import { auth, db } from "./firebase.js";

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  sendEmailVerification,
  signOut
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

// ==========================================
// MYZEN MONEY - REGISTER + PROFILE RECOVERY
// ==========================================

const form = document.getElementById("registerForm");
const registerBtn = document.getElementById("registerBtn");
const message = document.getElementById("registerMessage");

const countryInput = document.getElementById("country");
const nameInput = document.getElementById("name");
const nrcInput = document.getElementById("nrc");
const phoneInput = document.getElementById("phone");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const confirmPasswordInput = document.getElementById("confirmPassword");

function showMessage(text, type = "error") {
  if (!message) return;

  message.textContent = text;
  message.style.color =
    type === "success" ? "#087f55" : "#dc2626";
}

function setLoading(loading, text) {
  if (!registerBtn) return;

  registerBtn.disabled = loading;
  registerBtn.textContent = loading
    ? "Please wait..."
    : text || "Create Account →";
}

// ==========================================
// REGISTER
// ==========================================

if (form) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (registerBtn.disabled) return;

    const country = countryInput.value.trim();
    const name = nameInput.value.trim();
    const nrc = nrcInput.value.trim();
    const phone = phoneInput.value.trim();
    const email = emailInput.value.trim().toLowerCase();
    const password = passwordInput.value;
    const confirmPassword = confirmPasswordInput.value;

    // Validation
    if (!["Thailand", "Myanmar"].includes(country)) {
      showMessage("Please select a valid country.");
      return;
    }

    if (name.length < 2) {
      showMessage("Please enter your full name.");
      return;
    }

    if (!nrc) {
      showMessage("Please enter your NRC or National ID.");
      return;
    }

    if (phone.length < 6) {
      showMessage("Please enter a valid phone number.");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showMessage("Please enter a valid email address.");
      return;
    }

    if (password.length < 6) {
      showMessage("Password must contain at least 6 characters.");
      return;
    }

    if (password !== confirmPassword) {
      showMessage("Passwords do not match.");
      return;
    }

    setLoading(true);
    showMessage("Setting up your MYZEN MONEY account...", "success");

    let user = null;
    let createdNewAccount = false;

    try {
      // ======================================
      // 1. TRY TO CREATE NEW ACCOUNT
      // ======================================

      try {
        const credential = await createUserWithEmailAndPassword(
          auth,
          email,
          password
        );

        user = credential.user;
        createdNewAccount = true;

      } catch (createError) {

        if (createError.code !== "auth/email-already-in-use") {
          throw createError;
        }

        // ====================================
        // 2. EXISTING ACCOUNT RECOVERY
        // ====================================

        showMessage(
          "Existing account found. Checking your account...",
          "success"
        );

        const credential = await signInWithEmailAndPassword(
          auth,
          email,
          password
        );

        user = credential.user;
      }

      // ======================================
      // 3. CHECK EXISTING FIRESTORE PROFILE
      // ======================================

      const userRef = doc(db, "users", user.uid);
      const profileSnapshot = await getDoc(userRef);

      if (profileSnapshot.exists()) {
        await signOut(auth);

        showMessage(
          "Your account profile already exists. Please use Login.",
          "success"
        );

        setLoading(false);
        return;
      }

      // ======================================
      // 4. UPDATE DISPLAY NAME
      // ======================================

      if (!user.displayName) {
        await updateProfile(user, {
          displayName: name
        });
      }

      // ======================================
      // 5. CREATE FIRESTORE PROFILE
      // ======================================

      const userProfile = {
        uid: user.uid,
        name: name,
        email: email,
        country: country,
        nrc: nrc,
        phone: phone,

        balance: 0,
        status: "pending",

        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      await setDoc(userRef, userProfile);

      // ======================================
      // 6. SEND EMAIL VERIFICATION
      // ======================================

      let verificationMessage = "";

      if (!user.emailVerified) {
        try {
          await sendEmailVerification(user);

          verificationMessage =
            " Verification email sent. Please check your inbox.";
        } catch (verificationError) {
          console.error(
            "EMAIL VERIFICATION ERROR:",
            verificationError
          );

          verificationMessage =
            " Please request email verification from Login.";
        }
      }

      // ======================================
      // 7. SIGN OUT
      // ======================================

      await signOut(auth);

      showMessage(
        "Account setup successful! Status: PENDING ADMIN APPROVAL." +
        verificationMessage,
        "success"
      );

      form.reset();

      setLoading(true, "Registration Successful");

      setTimeout(() => {
        window.location.href = "login.html";
      }, 4000);

    } catch (error) {
      console.error("REGISTRATION / PROFILE ERROR:", error);

      // Do not delete the Firebase Authentication account.
      // The user can retry profile setup using the same account.

      if (auth.currentUser) {
        try {
          await signOut(auth);
        } catch (signOutError) {
          console.error("SIGN OUT ERROR:", signOutError);
        }
      }

      const errors = {
        "auth/invalid-email":
          "Invalid email address.",

        "auth/email-already-in-use":
          "This email is already registered.",

        "auth/weak-password":
          "Password must contain at least 6 characters.",

        "auth/invalid-credential":
          "Existing account found, but password is incorrect.",

        "auth/wrong-password":
          "Incorrect password.",

        "auth/too-many-requests":
          "Too many attempts. Please try again later.",

        "auth/network-request-failed":
          "Network error. Check your internet connection.",

        "permission-denied":
          "Firestore permission denied. Please check Firestore Rules.",

        "unavailable":
          "Firestore is temporarily unavailable. Please try again."
      };

      showMessage(
        errors[error.code] ||
        error.message ||
        "Unable to complete account setup."
      );

      setLoading(false);
    }
  });
}

// ==========================================
// PASSWORD VISIBILITY
// ==========================================

window.togglePassword = function (id, button) {
  const input = document.getElementById(id);

  if (!input) return;

  if (input.type === "password") {
    input.type = "text";
    button.textContent = "HIDE";
  } else {
    input.type = "password";
    button.textContent = "SHOW";
  }
};
