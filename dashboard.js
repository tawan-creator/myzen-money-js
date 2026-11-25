
import { auth, db } from "./firebase.js";

import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

import {
  doc,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

const balanceElement = document.getElementById("balance");
const nameElement = document.getElementById("userName");
const emailElement = document.getElementById("userEmail");
const phoneElement = document.getElementById("userPhone");
const countryElement = document.getElementById("userCountry");
const currencyElement = document.getElementById("userCurrency");
const statusElement = document.getElementById("userStatus");
const accountStatus = document.getElementById("accountStatus");
const welcomeText = document.getElementById("welcomeText");
const headerName = document.getElementById("headerName");
const messageElement = document.getElementById("dashboardMessage");

let unsubscribeProfile = null;

function showMessage(message, color = "#64748b") {
  messageElement.textContent = message;
  messageElement.style.color = color;
}

function getCurrencyInfo(data) {
  const country = data.country || "Myanmar";
  const currency = data.currency ||
    (country === "Thailand" ? "THB" : "MMK");

  if (country === "Thailand" || currency === "THB") {
    return {
      country: "Thailand",
      currency: "THB",
      formatted: amount =>
        "฿ " + amount.toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        })
    };
  }

  return {
    country: "Myanmar",
    currency: "MMK",
    formatted: amount =>
      "Ks " + amount.toLocaleString("en-US", {
        maximumFractionDigits: 0
      })
  };
}

onAuthStateChanged(auth, user => {
  if (unsubscribeProfile) {
    unsubscribeProfile();
    unsubscribeProfile = null;
  }

  if (!user) {
    window.location.href = "login.html";
    return;
  }

  emailElement.textContent = user.email || "-";

  unsubscribeProfile = onSnapshot(
    doc(db, "users", user.uid),

    snapshot => {
      if (!snapshot.exists()) {
        showMessage("Account profile not found.", "#dc2626");
        return;
      }

      const data = snapshot.data();
      const name = data.name || user.displayName || "User";
      const balance = Number(data.balance || 0);
      const status = data.status || "pending";
      const info = getCurrencyInfo(data);

      nameElement.textContent = name;
      headerName.textContent = name;
      phoneElement.textContent = data.phone || "Not added";
      welcomeText.textContent = "Welcome, " + name;

      countryElement.textContent =
        info.country === "Thailand"
          ? "🇹🇭 Thailand"
          : "🇲🇲 Myanmar";

      currencyElement.textContent =
        info.currency === "THB" ? "THB (฿)" : "MMK (Ks)";

      balanceElement.textContent = info.formatted(balance);
      statusElement.textContent = status.toUpperCase();

      if (status === "approved") {
        accountStatus.textContent = "Account Approved";
        statusElement.style.color = "#16a34a";
        showMessage("Your account is active. Welcome to MYZEN MONEY.");

        document.querySelectorAll(".menu-item").forEach(item => {
          item.style.pointerEvents = "auto";
          item.style.opacity = "1";
        });
      } else {
        accountStatus.textContent = "Waiting for Admin Approval";
        statusElement.style.color = "#d97706";
        showMessage(
          "Your account is pending. Please wait for Admin approval.",
          "#d97706"
        );

        document.querySelectorAll(".menu-item").forEach(item => {
          item.style.pointerEvents = "none";
          item.style.opacity = "0.45";
        });
      }
    },

    error => {
      console.error("Profile Error:", error);
      showMessage("Unable to load profile: " + error.message, "#dc2626");
    }
  );
});

document.getElementById("logoutBtn").addEventListener("click", async () => {
  try {
    if (unsubscribeProfile) unsubscribeProfile();
    await signOut(auth);
    window.location.href = "login.html";
  } catch (error) {
    alert("Logout Error: " + error.message);
  }
});
