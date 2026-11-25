
import { auth, db } from "./firebase.js";

import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

import {
  doc,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

// Safe HTML element access
function setText(id, value) {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = value;
  }
}

function showMessage(message, color = "#64748b") {
  setText("dashboardMessage", message);

  const element = document.getElementById("dashboardMessage");
  if (element) element.style.color = color;
}

let unsubscribeProfile = null;

onAuthStateChanged(auth, (user) => {
  if (unsubscribeProfile) {
    unsubscribeProfile();
    unsubscribeProfile = null;
  }

  if (!user) {
    window.location.href = "login.html";
    return;
  }

  setText("accountStatus", "Loading account...");
  setText("balance", "Loading...");
  setText("headerName", user.displayName || "User");
  setText("welcomeText", "Welcome to MYZEN MONEY");

  // Load Firebase User Profile
  const userRef = doc(db, "users", user.uid);

  unsubscribeProfile = onSnapshot(
    userRef,

    (snapshot) => {
      if (!snapshot.exists()) {
        setText("accountStatus", "Account profile not found");
        showMessage(
          "Your account profile does not exist in Firestore.",
          "#dc2626"
        );
        return;
      }

      const data = snapshot.data();

      const name = data.name || user.displayName || "User";
      const email = data.email || user.email || "-";
      const phone = data.phone || "Not added";
      const country = data.country || "Myanmar";
      const currency = data.currency ||
        (country === "Thailand" ? "THB" : "MMK");

      const balance = Number(data.balance || 0);
      const status = String(data.status || "pending").toLowerCase();

      // User information
      setText("headerName", name);
      setText("welcomeText", "Welcome, " + name);

      setText("userName", name);
      setText("userEmail", email);
      setText("userPhone", phone);
      setText("userCountry", country);
      setText("userCurrency", currency);
      setText("userStatus", status.toUpperCase());

      // Wallet balance
      if (currency === "THB") {
        setText(
          "balance",
          "฿ " + balance.toLocaleString("en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
          })
        );
      } else {
        setText(
          "balance",
          "Ks " + balance.toLocaleString("en-US")
        );
      }

      // Account status
      if (status === "approved") {
        setText("accountStatus", "Account Approved");

        showMessage(
          "Your account is active. Welcome to MYZEN MONEY.",
          "#16a34a"
        );

        document.querySelectorAll(".menu-item").forEach((item) => {
          item.style.pointerEvents = "auto";
          item.style.opacity = "1";
        });

      } else {
        setText(
          "accountStatus",
          "Waiting for Admin Approval"
        );

        showMessage(
          "Your account is pending. Please wait for Admin approval.",
          "#d97706"
        );

        document.querySelectorAll(".menu-item").forEach((item) => {
          item.style.pointerEvents = "none";
          item.style.opacity = "0.45";
        });
      }
    },

    (error) => {
      console.error("MYZEN Dashboard Error:", error);

      setText("accountStatus", "Unable to load account");

      showMessage(
        "Firebase Error: " + error.code,
        "#dc2626"
      );
    }
  );
});

// Logout
const logoutBtn = document.getElementById("logoutBtn");

if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    try {
      if (unsubscribeProfile) unsubscribeProfile();

      await signOut(auth);

      window.location.href = "login.html";

    } catch (error) {
      alert("Logout Error: " + error.message);
    }
  });
}
