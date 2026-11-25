
import { auth, db } from "./firebase.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

import {
  doc,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

const profileName = document.getElementById("profileName");
const profileEmail = document.getElementById("profileEmail");
const profilePhone = document.getElementById("profilePhone");
const profileCountry = document.getElementById("profileCountry");
const profileCurrency = document.getElementById("profileCurrency");
const profileBalance = document.getElementById("profileBalance");
const profileStatus = document.getElementById("profileStatus");
const profileNrc = document.getElementById("profileNrc");
const profileMessage = document.getElementById("profileMessage");

function normalizeCountry(country) {
  const value = String(country || "").trim().toLowerCase();

  if (["thailand", "ไทย", "th"].includes(value)) {
    return "Thailand";
  }

  if (["myanmar", "burma", "မြန်မာ", "mm"].includes(value)) {
    return "Myanmar";
  }

  return "";
}

function getCurrency(country, savedCurrency) {
  if (savedCurrency === "THB" || savedCurrency === "MMK") {
    return savedCurrency;
  }

  if (country === "Thailand") return "THB";
  if (country === "Myanmar") return "MMK";

  return "Not configured";
}

function formatBalance(balance, currency) {
  const amount = Number(balance || 0);

  if (currency === "THB") {
    return "฿ " + amount.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  if (currency === "MMK") {
    return "Ks " + amount.toLocaleString("en-US");
  }

  return amount.toLocaleString("en-US");
}

onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  const userRef = doc(db, "users", user.uid);

  onSnapshot(
    userRef,
    (snapshot) => {
      if (!snapshot.exists()) {
        profileMessage.textContent = "User profile not found.";
        return;
      }

      const data = snapshot.data();

      const country = normalizeCountry(data.country);
      const currency = getCurrency(country, data.currency);

      profileName.textContent = data.name || "-";
      profileEmail.textContent = data.email || user.email || "-";
      profilePhone.textContent = data.phone || "-";

      profileCountry.textContent =
        country || data.country || "Not configured";

      profileCurrency.textContent = currency;

      profileBalance.textContent =
        formatBalance(data.balance, currency);

      profileStatus.textContent = data.status || "pending";
      profileNrc.textContent = data.nrcDemo || "-";

      if (!country) {
        profileMessage.textContent =
          "Country is missing. Please update your registration profile.";
      } else {
        profileMessage.textContent = "";
      }
    },
    (error) => {
      console.error("Profile error:", error);
      profileMessage.textContent =
        "Unable to load profile: " + error.message;
    }
  );
});

document.getElementById("depositPageBtn").addEventListener("click", () => {
  window.location.href = "deposit.html";
});

document.getElementById("dashboardBtn").addEventListener("click", () => {
  window.location.href = "dashboard.html";
});
