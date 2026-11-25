
import { auth, db } from "./firebase.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

import {
  doc,
  getDoc,
  addDoc,
  collection,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

const form = document.getElementById("internationalForm");
const message = document.getElementById("internationalMessage");
const submitButton = document.getElementById("submitInternational");

let currentUser = null;
let currentProfile = null;

function showMessage(text, color = "#dc2626") {
  message.textContent = text;
  message.style.color = color;
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    location.replace("login.html");
    return;
  }

  currentUser = user;

  try {
    const snap = await getDoc(doc(db, "users", user.uid));

    if (!snap.exists()) {
      showMessage("User profile not found.");
      return;
    }

    currentProfile = snap.data();

    if (currentProfile.status !== "approved") {
      location.replace("pending.html");
      return;
    }

    // Use the user's registered country as the initial sending country.
    const country = currentProfile.country;
    if (country && [...document.getElementById("fromCountry").options]
      .some(option => option.value === country)) {
      document.getElementById("fromCountry").value = country;
    }

  } catch (error) {
    console.error(error);
    showMessage("Unable to load account: " + error.message);
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!currentUser || !currentProfile) {
    showMessage("Please wait. Account is loading.");
    return;
  }

  if (currentProfile.status !== "approved") {
    showMessage("Your account is not approved.");
    return;
  }

  const fromCountry = document.getElementById("fromCountry").value;
  const toCountry = document.getElementById("toCountry").value;
  const sendCurrency = document.getElementById("sendCurrency").value;
  const receiveCurrency = document.getElementById("receiveCurrency").value;
  const amount = Number(document.getElementById("sendAmount").value);

  if (fromCountry === toCountry) {
    showMessage("Choose two different countries.");
    return;
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    showMessage("Enter a valid transfer amount.");
    return;
  }

  const recipientName = document.getElementById("recipientName").value.trim();
  const recipientPhone = document.getElementById("recipientPhone").value.trim();
  const recipientBank = document.getElementById("recipientBank").value.trim();
  const accountNumber = document.getElementById("accountNumber").value.trim();
  const swiftCode = document.getElementById("swiftCode").value.trim();
  const note = document.getElementById("transferNote").value.trim();

  if (!recipientName || !recipientPhone || !recipientBank || !accountNumber) {
    showMessage("Please complete all required recipient details.");
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = "Submitting...";

  try {
    const request = {
      type: "international",
      senderUid: currentUser.uid,
      senderEmail: currentUser.email || "",
      senderName: currentProfile.name || "",
      fromCountry,
      toCountry,
      sendCurrency,
      receiveCurrency,
      sendAmount: amount,
      recipientName,
      recipientPhone,
      recipientBank,
      accountNumber,
      swiftCode,
      note,
      status: "pending",
      createdAt: serverTimestamp()
    };

    const result = await addDoc(
      collection(db, "internationalTransfers"),
      request
    );

    showMessage(
      "Transfer request submitted! Reference: " + result.id,
      "#15803d"
    );

    form.reset();

    if (currentProfile.country) {
      document.getElementById("fromCountry").value = currentProfile.country;
    }

  } catch (error) {
    console.error("International transfer error:", error);
    showMessage(
      error.code === "permission-denied"
        ? "Firestore permission denied. Please check your Firestore Rules."
        : "Could not submit request: " + error.message
    );
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Submit Transfer Request";
  }
});
