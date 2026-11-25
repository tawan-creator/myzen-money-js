
import { auth, db } from "./js/firebase.js";

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signOut,
  reload,
  updateProfile
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

import {
  doc,
  setDoc,
  getDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";


/* =====================================
   MYZEN MONEY AUTH SYSTEM
===================================== */

const registerForm = document.getElementById("registerForm");
const loginForm = document.getElementById("loginForm");

const registerMessage = document.getElementById("registerMessage");
const loginMessage = document.getElementById("loginMessage");

const registerBtn = document.getElementById("registerBtn");
const loginBtn = document.getElementById("loginBtn");

const resendVerificationBtn =
  document.getElementById("resendVerificationBtn");

const forgotPasswordBtn =
  document.getElementById("forgotPasswordBtn");


/* =====================================
   HELPER FUNCTIONS
===================================== */

function showMessage(element, message, success = false) {
  if (!element) {
    alert(message);
    return;
  }

  element.style.display = "block";
  element.textContent = message;

  element.style.padding = "12px";
  element.style.marginTop = "12px";
  element.style.borderRadius = "8px";

  element.style.background = success ? "#e7f8ed" : "#fee4e2";
  element.style.color = success ? "#067647" : "#b42318";
}

function setButtonLoading(button, loading, normalText) {
  if (!button) return;

  button.disabled = loading;
  button.textContent = loading ? "Please wait..." : normalText;
}

function normalizeCountry(value) {
  const country = String(value || "").trim().toLowerCase();

  if (["thailand", "ไทย", "th"].includes(country)) {
    return "Thailand";
  }

  if (["myanmar", "burma", "မြန်မာ", "mm"].includes(country)) {
    return "Myanmar";
  }

  return "";
}

function getFirebaseError(error) {
  const code = error?.code || "";

  const messages = {
    "auth/email-already-in-use":
      "This email is already registered.",

    "auth/invalid-email":
      "Please enter a valid email address.",

    "auth/weak-password":
      "Password must be at least 6 characters.",

    "auth/invalid-credential":
      "Incorrect email or password.",

    "auth/user-not-found":
      "Account not found.",

    "auth/wrong-password":
      "Incorrect password.",

    "auth/too-many-requests":
      "Too many attempts. Please try again later.",

    "auth/network-request-failed":
      "Network error. Please check your internet connection."
  };

  return messages[code] || error?.message || "Something went wrong.";
}


/* =====================================
   REGISTRATION
===================================== */

if (registerForm) {
  registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (registerMessage) {
      registerMessage.style.display = "none";
    }

    const name =
      document.getElementById("name")?.value.trim() ||
      document.getElementById("fullName")?.value.trim() ||
      "";

    const email =
      document.getElementById("registerEmail")?.value.trim() ||
      document.getElementById("email")?.value.trim() ||
      "";

    const phone =
      document.getElementById("phone")?.value.trim() || "";

    const password =
      document.getElementById("registerPassword")?.value ||
      document.getElementById("password")?.value ||
      "";

    const confirmPassword =
      document.getElementById("confirmPassword")?.value || "";

    const country = normalizeCountry(
      document.getElementById("country")?.value
    );

    // Validate required fields

    if (!name || !email || !password || !country) {
      showMessage(
        registerMessage,
        "Please complete all required fields."
      );
      return;
    }

    if (password.length < 6) {
      showMessage(
        registerMessage,
        "Password must be at least 6 characters."
      );
      return;
    }

    if (password !== confirmPassword) {
      showMessage(
        registerMessage,
        "Passwords do not match."
      );
      return;
    }

    const currency =
      country === "Thailand" ? "THB" : "MMK";

    setButtonLoading(
      registerBtn,
      true,
      "Create Account"
    );

    let createdUser = null;

    try {
      // 1. Create Firebase Authentication account

      const credential =
        await createUserWithEmailAndPassword(
          auth,
          email,
          password
        );

      createdUser = credential.user;

      // 2. Set Firebase display name

      await updateProfile(createdUser, {
        displayName: name
      });

      // 3. Save user profile to Firestore

      const userData = {
        uid: createdUser.uid,
        name: name,
        email: email,
        phone: phone,

        country: country,
        currency: currency,

        balance: 0,

        status: "pending",

        emailVerified: false,

        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      await setDoc(
        doc(db, "users", createdUser.uid),
        userData
      );

      // 4. Send email verification

      await sendEmailVerification(createdUser);

      // 5. Sign out after registration

      await signOut(auth);

      showMessage(
        registerMessage,
        "Registration successful! Please check your email and verify your account. Your account is waiting for Admin approval.",
        true
      );

      registerForm.reset();

    } catch (error) {
      console.error("Registration error:", error);

      // If account creation succeeded but a later step failed,
      // do not silently delete the account or Firestore profile.
      if (createdUser) {
        showMessage(
          registerMessage,
          "Account was created, but setup did not finish: " +
          getFirebaseError(error) +
          ". Please contact Admin before registering again."
        );
      } else {
        showMessage(
          registerMessage,
          getFirebaseError(error)
        );
      }

    } finally {
      setButtonLoading(
        registerBtn,
        false,
        "Create Account"
      );
    }
  });
}


/* =====================================
   LOGIN
===================================== */

if (loginForm) {
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (loginMessage) {
      loginMessage.style.display = "none";
    }

    const email =
      document.getElementById("email")?.value.trim() || "";

    const password =
      document.getElementById("password")?.value || "";

    if (!email || !password) {
      showMessage(
        loginMessage,
        "Please enter your email and password."
      );
      return;
    }

    setButtonLoading(
      loginBtn,
      true,
      "Login"
    );

    try {
      // 1. Firebase login

      const credential =
        await signInWithEmailAndPassword(
          auth,
          email,
          password
        );

      const user = credential.user;

      // 2. Refresh verification status

      await reload(user);

      if (!auth.currentUser.emailVerified) {
        showMessage(
          loginMessage,
          "Please verify your email before logging in."
        );

        if (resendVerificationBtn) {
          resendVerificationBtn.style.display = "block";
        }

        await signOut(auth);
        return;
      }

      // 3. Read Firestore user profile

      const userRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        await signOut(auth);

        showMessage(
          loginMessage,
          "User profile not found. Please contact Admin."
        );

        return;
      }

      const profile = userSnap.data();

      // 4. Check admin approval

      if (profile.status === "approved") {
        window.location.href = "dashboard.html";

      } else if (profile.status === "pending") {
        window.location.href = "pending.html";

      } else {
        await signOut(auth);

        showMessage(
          loginMessage,
          "Your account is not approved. Please contact Admin."
        );
      }

    } catch (error) {
      console.error("Login error:", error);

      showMessage(
        loginMessage,
        getFirebaseError(error)
      );

    } finally {
      setButtonLoading(
        loginBtn,
        false,
        "Login"
      );
    }
  });
}


/* =====================================
   RESEND EMAIL VERIFICATION
===================================== */

if (resendVerificationBtn) {
  resendVerificationBtn.addEventListener("click", async () => {
    const email =
      document.getElementById("email")?.value.trim() || "";

    const password =
      document.getElementById("password")?.value || "";

    if (!email || !password) {
      showMessage(
        loginMessage,
        "Enter your email and password first."
      );
      return;
    }

    try {
      const credential =
        await signInWithEmailAndPassword(
          auth,
          email,
          password
        );

      await reload(credential.user);

      if (credential.user.emailVerified) {
        showMessage(
          loginMessage,
          "Your email is already verified. Please login again.",
          true
        );

        await signOut(auth);
        return;
      }

      await sendEmailVerification(credential.user);

      await signOut(auth);

      showMessage(
        loginMessage,
        "Verification email sent. Please check your inbox.",
        true
      );

    } catch (error) {
      console.error("Resend verification error:", error);

      showMessage(
        loginMessage,
        getFirebaseError(error)
      );
    }
  });
}


/* =====================================
   FORGOT PASSWORD
===================================== */

if (forgotPasswordBtn) {
  forgotPasswordBtn.addEventListener("click", async () => {
    const email =
      document.getElementById("email")?.value.trim() || "";

    if (!email) {
      showMessage(
        loginMessage,
        "Please enter your email address first."
      );
      return;
    }

    try {
      await sendPasswordResetEmail(auth, email);

      showMessage(
        loginMessage,
        "Password reset email sent. Please check your inbox.",
        true
      );

    } catch (error) {
      console.error("Password reset error:", error);

      showMessage(
        loginMessage,
        getFirebaseError(error)
      );
    }
  });
}
