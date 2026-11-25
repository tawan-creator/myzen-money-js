
import { auth, db } from "./firebase.js";

import {
  signInWithEmailAndPassword,
  signOut,
  reload,
  sendEmailVerification
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

import {
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

const form = document.getElementById("loginForm");

function showMessage(id, text, color = "#dc2626") {
  const element = document.getElementById(id);
  if (!element) return;

  element.textContent = text;
  element.style.color = color;
}

// LOGIN
if (form) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = document.getElementById("email")
      .value.trim().toLowerCase();

    const password = document.getElementById("password").value;

    const button = document.getElementById("loginBtn");

    button.disabled = true;
    button.textContent = "Logging in...";
    showMessage("loginMessage", "");

    try {
      const credential = await signInWithEmailAndPassword(
        auth, email, password
      );

      const user = credential.user;
      await reload(user);

      if (!user.emailVerified) {
        await signOut(auth);
        showMessage(
          "loginMessage",
          "Please verify your email. Use Resend Verification Email below."
        );
        return;
      }

      const profileSnapshot = await getDoc(
        doc(db, "users", user.uid)
      );

      if (!profileSnapshot.exists()) {
        await signOut(auth);
        showMessage("loginMessage", "Account profile not found.");
        return;
      }

      const profile = profileSnapshot.data();

      if (profile.status === "approved") {
        window.location.replace("dashboard.html");
      } else if (profile.status === "pending") {
        window.location.replace("pending.html");
      } else {
        await signOut(auth);
        showMessage("loginMessage", "Account is not active.");
      }

    } catch (error) {
      console.error(error);

      const errors = {
        "auth/invalid-credential": "Incorrect email or password.",
        "auth/user-not-found": "Account not found.",
        "auth/invalid-email": "Invalid email address.",
        "auth/too-many-requests": "Too many attempts. Try again later.",
        "permission-denied": "Firestore permission denied."
      };

      showMessage(
        "loginMessage",
        errors[error.code] || error.message
      );

    } finally {
      button.disabled = false;
      button.textContent = "Login";
    }
  });
}

// RESEND VERIFICATION EMAIL
const resendButton = document.getElementById(
  "resendVerificationBtn"
);

if (resendButton) {
  resendButton.addEventListener("click", async () => {

    const email = document.getElementById("email")
      .value.trim().toLowerCase();

    const password = document.getElementById("password").value;

    if (!email || !password) {
      showMessage(
        "resendMessage",
        "Enter your registered email and password first."
      );
      return;
    }

    resendButton.disabled = true;
    resendButton.textContent = "Sending...";

    showMessage("resendMessage", "");

    let temporaryUser = null;

    try {
      // Authenticate the account before resending
      const credential = await signInWithEmailAndPassword(
        auth, email, password
      );

      temporaryUser = credential.user;

      await reload(temporaryUser);

      if (temporaryUser.emailVerified) {
        await signOut(auth);
        temporaryUser = null;

        showMessage(
          "resendMessage",
          "Your email is already verified. Please Login.",
          "#15803d"
        );
        return;
      }

      await sendEmailVerification(temporaryUser);

      await signOut(auth);
      temporaryUser = null;

      showMessage(
        "resendMessage",
        "Verification email sent! Check your Inbox and Spam folder.",
        "#15803d"
      );

    } catch (error) {
      console.error("Resend verification error:", error);

      if (temporaryUser) {
        try {
          await signOut(auth);
        } catch (logoutError) {
          console.error(logoutError);
        }
      }

      const errors = {
        "auth/invalid-credential": "Incorrect email or password.",
        "auth/user-not-found": "Account not found.",
        "auth/invalid-email": "Invalid email address.",
        "auth/too-many-requests": "Too many requests. Please wait and try again.",
        "auth/operation-not-allowed": "Email/Password sign-in is not enabled."
      };

      showMessage(
        "resendMessage",
        errors[error.code] || error.message
      );

    } finally {
      resendButton.disabled = false;
      resendButton.textContent = "Resend Verification Email";
    }
  });
}
