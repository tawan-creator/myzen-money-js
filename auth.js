import { auth, db } from "./firebase.js";

import {
  createUserWithEmailAndPassword,
  updateProfile,
  sendEmailVerification,
  signOut
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

import {
  doc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

const form = document.getElementById("registerForm");

if (form) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const country = document.getElementById("country").value;
    const currency = country === "Thailand" ? "THB" : "MMK";
    const name = document.getElementById("name").value.trim();
    const nrc = document.getElementById("nrc").value.trim();
    const phone = document.getElementById("phone").value.trim();
    const email = document.getElementById("email").value.trim().toLowerCase();
    const password = document.getElementById("password").value;
    const confirmPassword = document.getElementById("confirmPassword").value;

    const message = document.getElementById("registerMessage");
    const button = document.getElementById("registerBtn");

    const showMessage = (text, color = "#dc2626") => {
      message.textContent = text;
      message.style.color = color;
    };

    if (!country || !["Thailand", "Myanmar"].includes(country)) {
      showMessage("Please select Thailand or Myanmar.");
      return;
    }

    if (password !== confirmPassword) {
      showMessage("Passwords do not match.");
      return;
    }

    if (name.length < 2 || nrc.length < 3 || phone.length < 6) {
      showMessage("Please enter valid demo details.");
      return;
    }

    if (password.length < 6) {
      showMessage("Password must contain at least 6 characters.");
      return;
    }

    button.disabled = true;
    button.textContent = "Creating account...";
    showMessage("");

    try {
      const credential = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );

      const user = credential.user;

      await updateProfile(user, {
        displayName: name
      });

      await setDoc(doc(db, "users", user.uid), {
        uid: user.uid,
        name: name,
        nrcDemo: nrc,
        phone: phone,
        email: user.email,
        country: country,
        currency: currency,
        status: "pending",
        balance: 0,
        createdAt: serverTimestamp()
      });

      await sendEmailVerification(user);
      await signOut(auth);

      form.reset();

      showMessage(
        `Registration successful! Country: ${country}. Currency: ${currency}. Check your email and verify your account. Then login and wait for Admin approval.`,
        "#15803d"
      );

    } catch (error) {
      console.error("Registration error:", error);

      const errors = {
        "auth/email-already-in-use": "This email is already registered.",
        "auth/invalid-email": "Invalid email address.",
        "auth/weak-password": "Password is too weak.",
        "permission-denied": "Firestore permission denied. Check your Firestore Rules.",
        "unavailable": "Network unavailable. Please try again."
      };

      showMessage(errors[error.code] || error.message);

    } finally {
      button.disabled = false;
      button.textContent = "Create Account";
    }
  });
}
