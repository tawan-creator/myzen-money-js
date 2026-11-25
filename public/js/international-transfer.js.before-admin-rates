
import { auth, db } from "./firebase.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

import {
  doc,
  getDoc,
  addDoc,
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

const $ = (id) => document.getElementById(id);

const accountInfo = $("accountInfo");
const routeText = $("routeText");
const form = $("transferForm");
const message = $("message");
const submitButton = $("submitBtn");

const senderCountryInput = $("senderCountry");
const receiverCountryInput = $("receiverCountry");
const bankSelect = $("bankName");

const accountNumberInput = $("accountNumber");
const accountHolderInput = $("accountHolder");
const recipientPhoneInput = $("recipientPhone");

const amountInput = $("amount");
const currencyInput = $("currency");
const receiveAmountInput = $("receiveAmount");
const exchangeRateText = $("exchangeRateText");
const noteInput = $("note");

const historyElement = $("history");

let currentUser = null;
let currentProfile = null;
let sendingCurrency = "";
let receivingCurrency = "";
let exchangeRate = 0;
let historyUnsubscribe = null;

function showMessage(text, color = "#dc2626") {
  message.textContent = text;
  message.style.color = color;
}

function formatMoney(amount, currency) {
  return Number(amount || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }) + " " + currency;
}

function setupExchangeRate(from, to) {
  if (from === "Thailand" && to === "Myanmar") {
    sendingCurrency = "THB";
    receivingCurrency = "MMK";
    exchangeRate = 152;
  } else if (from === "Myanmar" && to === "Thailand") {
    sendingCurrency = "MMK";
    receivingCurrency = "THB";
    exchangeRate = 1 / 150;
  } else {
    throw new Error("Unsupported transfer route.");
  }

  currencyInput.value = sendingCurrency;

  exchangeRateText.textContent =
    "1 " + sendingCurrency + " = " +
    exchangeRate.toLocaleString("en-US", {
      maximumFractionDigits: 6
    }) + " " + receivingCurrency;
}

function calculateReceiveAmount() {
  const amount = Number(amountInput.value);

  if (!Number.isFinite(amount) || amount <= 0 || !exchangeRate) {
    receiveAmountInput.value = "";
    return;
  }

  receiveAmountInput.value = formatMoney(
    amount * exchangeRate,
    receivingCurrency
  );
}

amountInput.addEventListener("input", calculateReceiveAmount);

function loadBanks(country) {
  const banks = country === "Thailand"
    ? [
        "Bangkok Bank",
        "Kasikornbank",
        "Siam Commercial Bank",
        "Krungthai Bank",
        "Krungsri Bank",
        "Other"
      ]
    : [
        "KBZ Bank",
        "AYA Bank",
        "CB Bank",
        "Yoma Bank",
        "UAB Bank",
        "Other"
      ];

  bankSelect.replaceChildren();

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Select Recipient Bank";
  bankSelect.appendChild(placeholder);

  banks.forEach((bank) => {
    const option = document.createElement("option");
    option.value = bank;
    option.textContent = bank;
    bankSelect.appendChild(option);
  });
}

function loadTransferHistory(uid) {
  if (historyUnsubscribe) {
    historyUnsubscribe();
    historyUnsubscribe = null;
  }

  const requestsQuery = query(
    collection(db, "internationalTransfers"),
    where("senderUid", "==", uid),
    orderBy("createdAt", "desc")
  );

  historyUnsubscribe = onSnapshot(
    requestsQuery,
    (snapshot) => {
      historyElement.replaceChildren();

      if (snapshot.empty) {
        historyElement.textContent = "No transfer requests yet.";
        return;
      }

      snapshot.forEach((item) => {
        const data = item.data();

        const wrapper = document.createElement("div");
        wrapper.className = "request";

        const route = document.createElement("strong");
        route.textContent =
          (data.fromCountry || "-") + " → " + (data.toCountry || "-");

        const amount = document.createElement("p");
        amount.textContent =
          "Sending: " +
          formatMoney(data.sendAmount, data.sendCurrency);

        const received = document.createElement("p");
        received.textContent =
          "Receiving: " +
          formatMoney(data.receiveAmount, data.receiveCurrency);

        const bank = document.createElement("p");
        bank.textContent =
          "Recipient Bank: " + (data.recipientBank || "-");

        const reference = document.createElement("p");
        reference.textContent = "Reference: " + item.id;

        const status = document.createElement("p");
        const statusValue =
          String(data.status || "pending").toLowerCase();

        status.textContent = "Status: " + statusValue.toUpperCase();

        if (["pending", "approved", "completed", "rejected"].includes(statusValue)) {
          status.className = statusValue;
        }

        wrapper.append(route, amount, received, bank, reference, status);
        historyElement.appendChild(wrapper);
      });
    },
    (error) => {
      console.error("Transfer history error:", error);
      historyElement.textContent =
        "Unable to load transfer history: " + error.message;
    }
  );
}

submitButton.disabled = true;
submitButton.textContent = "Loading Account...";

onAuthStateChanged(auth, async (user) => {
  if (historyUnsubscribe) {
    historyUnsubscribe();
    historyUnsubscribe = null;
  }

  if (!user) {
    location.replace("login.html");
    return;
  }

  currentUser = user;
  currentProfile = null;

  accountInfo.textContent = "Loading account...";
  routeText.textContent = "Loading transfer route...";

  try {
    const profileSnapshot = await getDoc(
      doc(db, "users", user.uid)
    );

    if (!profileSnapshot.exists()) {
      accountInfo.textContent = "User profile not found.";
      routeText.textContent = "Transfer route unavailable.";
      submitButton.disabled = true;
      submitButton.textContent = "Account Not Found";
      return;
    }

    currentProfile = profileSnapshot.data();

    const status = String(currentProfile.status || "").toLowerCase();

    if (status !== "approved") {
      accountInfo.textContent =
        "Your account is waiting for Admin approval.";

      routeText.textContent = "Transfer is not available.";
      submitButton.disabled = true;
      submitButton.textContent = "Account Not Approved";
      return;
    }

    const country = String(currentProfile.country || "").trim();

    if (!["Thailand", "Myanmar"].includes(country)) {
      accountInfo.textContent =
        "Your registered country must be Thailand or Myanmar.";

      routeText.textContent = "Unsupported transfer route.";
      submitButton.disabled = true;
      submitButton.textContent = "Unsupported Country";
      return;
    }

    const receivingCountry =
      country === "Thailand" ? "Myanmar" : "Thailand";

    senderCountryInput.value = country;
    receiverCountryInput.value = receivingCountry;

    routeText.textContent =
      country + " → " + receivingCountry;

    accountInfo.textContent =
      "Welcome, " +
      (currentProfile.name || user.displayName || "User") +
      " | Account: APPROVED";

    setupExchangeRate(country, receivingCountry);
    loadBanks(receivingCountry);
    loadTransferHistory(user.uid);

    submitButton.disabled = false;
    submitButton.textContent = "Submit Transfer Request";

  } catch (error) {
    console.error("Transfer account error:", error);

    accountInfo.textContent =
      "Unable to load account: " + error.message;

    routeText.textContent = "Transfer route unavailable.";
    submitButton.disabled = true;
    submitButton.textContent = "Unable to Load Account";
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!currentUser || !currentProfile) {
    showMessage("Please wait. Account is loading.");
    return;
  }

  if (String(currentProfile.status || "").toLowerCase() !== "approved") {
    showMessage("Your account is not approved.");
    return;
  }

  const fromCountry = senderCountryInput.value;
  const toCountry = receiverCountryInput.value;
  const amount = Number(amountInput.value);

  const recipientBank = bankSelect.value;
  const accountNumber = accountNumberInput.value.trim();
  const recipientName = accountHolderInput.value.trim();
  const recipientPhone = recipientPhoneInput.value.trim();
  const note = noteInput.value.trim();

  if (!Number.isFinite(amount) || amount <= 0) {
    showMessage("Enter a valid sending amount.");
    return;
  }

  if (!recipientBank || !accountNumber || !recipientName || !recipientPhone) {
    showMessage("Please complete all required recipient details.");
    return;
  }

  if (!exchangeRate || fromCountry === toCountry) {
    showMessage("Invalid transfer route.");
    return;
  }

  const receiveAmount = Number((amount * exchangeRate).toFixed(2));

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

      sendCurrency: sendingCurrency,
      receiveCurrency: receivingCurrency,

      sendAmount: amount,
      receiveAmount,
      exchangeRate,

      recipientBank,
      accountNumber,
      recipientName,
      recipientPhone,

      note,
      status: "pending",
      createdAt: serverTimestamp()
    };

    const result = await addDoc(
      collection(db, "internationalTransfers"),
      request
    );

    showMessage(
      "Transfer request submitted successfully. Reference: " + result.id,
      "#15803d"
    );

    form.reset();

    senderCountryInput.value = fromCountry;
    receiverCountryInput.value = toCountry;
    currencyInput.value = sendingCurrency;
    receiveAmountInput.value = "";

  } catch (error) {
    console.error("Transfer submission error:", error);
    showMessage("Unable to submit transfer: " + error.message);
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Submit Transfer Request";
  }
});

window.addEventListener("beforeunload", () => {
  if (historyUnsubscribe) {
    historyUnsubscribe();
  }
});
