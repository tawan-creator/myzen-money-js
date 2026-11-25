
import { auth, db } from "./firebase.js";

import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

import {
  doc,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

// HTML elements
const elements = {
  headerName: document.getElementById("headerName"),
  name: document.getElementById("profileName"),
  email: document.getElementById("profileEmail"),
  phone: document.getElementById("profilePhone"),
  nrc: document.getElementById("profileNrc"),
  country: document.getElementById("profileCountry"),
  currency: document.getElementById("profileCurrency"),
  status: document.getElementById("profileStatus"),
  created: document.getElementById("profileCreated"),
  balance: document.getElementById("profileBalance"),
  message: document.getElementById("profileMessage")
};

// Currency settings
function getCurrency(data) {
  const country = String(data.country || "Myanmar").trim();

  let currency = String(data.currency || "").toUpperCase();

  if (!currency) {
    currency = country.toLowerCase() === "thailand"
      ? "THB"
      : "MMK";
  }

  if (currency === "THB") {
    return {
      country,
      currency: "THB",
      display: "THB (฿)",
      symbol: "฿"
    };
  }

  return {
    country,
    currency: "MMK",
    display: "MMK (Ks)",
    symbol: "Ks "
  };
}

// Format balance
function formatBalance(balance, currency) {
  const amount = Number(balance || 0);

  return currency.symbol +
    (Number.isFinite(amount) ? amount : 0).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
}

// Format registration date
function formatDate(timestamp) {
  if (!timestamp) return "Not available";

  const date = timestamp.toDate
    ? timestamp.toDate()
    : new Date(timestamp);

  if (isNaN(date.getTime())) return "Not available";

  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

// Logout
document.getElementById("logoutBtn")?.addEventListener("click", async () => {
  try {
    await signOut(auth);
    window.location.href = "login.html";
  } catch (error) {
    console.error(error);
    elements.message.textContent = error.message;
  }
});

// Load profile
onAuthStateChanged(auth, (user) => {

  if (!user) {
    window.location.href = "login.html";
    return;
  }

  elements.message.textContent = "Loading profile...";

  const userRef = doc(db, "users", user.uid);

  onSnapshot(userRef, (snapshot) => {

    if (!snapshot.exists()) {
      elements.message.textContent =
        "Profile information not found.";
      return;
    }

    const data = snapshot.data();

    const name = data.name || user.displayName || "Not added";
    const email = data.email || user.email || "Not added";
    const phone = data.phone || "Not added";
    const nrc = data.nrcDemo || "Not added";

    const status = String(data.status || "pending").toUpperCase();

    const currency = getCurrency(data);

    // Personal information
    elements.headerName.textContent = name;
    elements.name.textContent = name;
    elements.email.textContent = email;
    elements.phone.textContent = phone;
    elements.nrc.textContent = nrc;

    // Account information
    elements.country.textContent = currency.country;
    elements.currency.textContent = currency.display;
    elements.status.textContent = status;
    elements.created.textContent = formatDate(data.createdAt);

    // Wallet
    elements.balance.textContent =
      formatBalance(data.balance, currency);

    elements.message.textContent = "";

    console.log("MYZEN PROFILE DATA:", data);

  }, (error) => {

    console.error("Profile loading error:", error);

    elements.message.textContent =
      "Unable to load profile: " + error.message;

  });

});
