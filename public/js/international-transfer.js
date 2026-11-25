
import { auth, db } from "./firebase.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

import {
  doc,
  getDoc,
  collection,
  query,
  where,
  orderBy,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

const API_BASE_URL = "https://myzen-money-js.onrender.com";
const RATE_REFRESH_INTERVAL = 30000;

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
let rateRefreshTimer = null;
let transferRouteReady = false;

// Keep the same key when retrying a failed request.
let pendingTransferIdempotencyKey = null;

function showMessage(text, color = "#dc2626") {
  message.textContent = text;
  message.style.color = color;
}

function formatMoney(amount, currency) {
  const maximumFractionDigits = currency === "MMK" ? 0 : 2;
  const minimumFractionDigits = currency === "MMK" ? 0 : 2;

  return Number(amount || 0).toLocaleString("en-US", {
    minimumFractionDigits,
    maximumFractionDigits
  }) + " " + currency;
}

function formatRate(rate) {
  return Number(rate).toLocaleString("en-US", {
    maximumFractionDigits: 6
  });
}

function calculateReceiveAmount() {
  const amount = Number(amountInput.value);

  if (
    !Number.isFinite(amount) ||
    amount <= 0 ||
    !Number.isFinite(exchangeRate) ||
    exchangeRate <= 0
  ) {
    receiveAmountInput.value = "";
    return;
  }

  const rawAmount = amount * exchangeRate;

  const result = receivingCurrency === "MMK"
    ? Math.round(rawAmount)
    : Number(rawAmount.toFixed(2));

  receiveAmountInput.value = formatMoney(
    result,
    receivingCurrency
  );
}

function updateExchangeRateDisplay() {
  if (!exchangeRate || !sendingCurrency || !receivingCurrency) {
    exchangeRateText.textContent =
      "Exchange rate unavailable. Please try again later.";

    receiveAmountInput.value = "";
    submitButton.disabled = true;
    submitButton.textContent = "Exchange Rate Unavailable";
    return;
  }

  exchangeRateText.textContent =
    "1 " + sendingCurrency + " = " +
    formatRate(exchangeRate) + " " + receivingCurrency;

  calculateReceiveAmount();

  submitButton.disabled = false;
  submitButton.textContent = "Submit Transfer Request";
}

function setupExchangeRate(from, to) {
  if (from === "Thailand" && to === "Myanmar") {
    sendingCurrency = "THB";
    receivingCurrency = "MMK";
  } else if (from === "Myanmar" && to === "Thailand") {
    sendingCurrency = "MMK";
    receivingCurrency = "THB";
  } else {
    throw new Error("Unsupported transfer route.");
  }

  exchangeRate = 0;

  currencyInput.value = sendingCurrency;

  exchangeRateText.textContent = "Loading Admin exchange rate...";
  receiveAmountInput.value = "";

  submitButton.disabled = true;
}

async function loadAdminExchangeRate() {
  if (!currentUser || !sendingCurrency || !receivingCurrency) {
    return false;
  }

  try {
    const token = await currentUser.getIdToken();

    const response = await fetch(
      `${API_BASE_URL}/api/exchange-rates`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`
        },
        cache: "no-store"
      }
    );

    let data;

    try {
      data = await response.json();
    } catch {
      throw new Error("Invalid exchange rate server response.");
    }

    if (!response.ok || data.success === false) {
      throw new Error(
        data.message || "Unable to load exchange rates."
      );
    }

    const rates =
      data.rates ||
      data.exchangeRates ||
      data.settings ||
      data;

    const selectedRate =
      sendingCurrency === "THB"
        ? Number(rates.thbToMmk)
        : Number(rates.mmkToThb);

    if (
      !Number.isFinite(selectedRate) ||
      selectedRate <= 0
    ) {
      exchangeRate = 0;
      updateExchangeRateDisplay();

      showMessage(
        "The Admin has not configured this exchange rate yet."
      );

      return false;
    }

    exchangeRate = selectedRate;

    updateExchangeRateDisplay();

    return true;

  } catch (error) {
    console.error("Exchange rate loading error:", error);

    exchangeRate = 0;
    updateExchangeRateDisplay();

    showMessage(
      "Unable to load exchange rate: " + error.message
    );

    return false;
  }
}

function startExchangeRateRefresh() {
  stopExchangeRateRefresh();

  rateRefreshTimer = setInterval(() => {
    if (document.visibilityState === "visible") {
      loadAdminExchangeRate();
    }
  }, RATE_REFRESH_INTERVAL);
}

function stopExchangeRateRefresh() {
  if (rateRefreshTimer) {
    clearInterval(rateRefreshTimer);
    rateRefreshTimer = null;
  }
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

        if (
          ["pending", "approved", "completed", "rejected"].includes(statusValue)
        ) {
          status.className = statusValue;
        }

        wrapper.append(
          route,
          amount,
          received,
          bank,
          reference,
          status
        );

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

  stopExchangeRateRefresh();

  pendingTransferIdempotencyKey = null;

  if (!user) {
    location.replace("login.html");
    return;
  }

  currentUser = user;
  currentProfile = null;
  transferRouteReady = false;

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

    const status = String(
      currentProfile.status || ""
    ).toLowerCase();

    if (status !== "approved") {
      accountInfo.textContent =
        "Your account is waiting for Admin approval.";

      routeText.textContent = "Transfer is not available.";

      submitButton.disabled = true;
      submitButton.textContent = "Account Not Approved";
      return;
    }

    const country = String(
      currentProfile.country || ""
    ).trim();

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

    transferRouteReady = true;

    await loadAdminExchangeRate();

    startExchangeRateRefresh();

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

  if (!transferRouteReady) {
    showMessage("Transfer route is not ready.");
    return;
  }

  if (
    String(currentProfile.status || "").toLowerCase() !== "approved"
  ) {
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

  if (
    sendingCurrency === "THB" &&
    Math.abs(amount * 100 - Math.round(amount * 100)) > 0.000001
  ) {
    showMessage("THB amount can only have up to 2 decimal places.");
    return;
  }

  if (
    sendingCurrency === "MMK" &&
    !Number.isSafeInteger(amount)
  ) {
    showMessage("MMK amount must be a whole number.");
    return;
  }

  if (
    !recipientBank ||
    !accountNumber ||
    !recipientName ||
    !recipientPhone
  ) {
    showMessage("Please complete all required recipient details.");
    return;
  }

  if (
    !Number.isFinite(exchangeRate) ||
    exchangeRate <= 0 ||
    fromCountry === toCountry
  ) {
    showMessage("Exchange rate is unavailable. Please try again.");
    await loadAdminExchangeRate();
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = "Checking Latest Rate...";

  try {
    // Refresh the rate before submitting.
    const rateLoaded = await loadAdminExchangeRate();

    if (!rateLoaded || exchangeRate <= 0) {
      throw new Error(
        "Exchange rate is unavailable. Please try again later."
      );
    }

    // Create one stable ID for this submission.
    // If the network fails, the same ID is reused on retry.
    if (!pendingTransferIdempotencyKey) {
      if (!globalThis.crypto?.randomUUID) {
        throw new Error(
          "Secure request ID generation is not supported by this browser."
        );
      }

      pendingTransferIdempotencyKey =
        globalThis.crypto.randomUUID();
    }

    const token = await currentUser.getIdToken(true);

    const response = await fetch(
      `${API_BASE_URL}/api/international-transfers`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          idempotencyKey: pendingTransferIdempotencyKey,
          sendAmount: amount,
          recipientBank,
          accountNumber,
          recipientName,
          recipientPhone,
          note
        })
      }
    );

    let data;

    try {
      data = await response.json();
    } catch {
      throw new Error("Invalid transfer server response.");
    }

    if (!response.ok || data.success !== true) {
      throw new Error(
        data.message || "Unable to submit transfer."
      );
    }

    const result = data.result || {};

    // Clear the key only after the server confirms success.
    pendingTransferIdempotencyKey = null;

    showMessage(
      "Transfer request submitted successfully. Reference: " +
      (result.requestId || "Submitted"),
      "#15803d"
    );

    form.reset();

    senderCountryInput.value = fromCountry;
    receiverCountryInput.value = toCountry;
    currencyInput.value = sendingCurrency;

    receiveAmountInput.value = "";

    calculateReceiveAmount();

    // Refresh the profile so the latest wallet balance is available.
    const updatedProfile = await getDoc(
      doc(db, "users", currentUser.uid)
    );

    if (updatedProfile.exists()) {
      currentProfile = updatedProfile.data();
    }

  } catch (error) {
    console.error("Transfer submission error:", error);

    showMessage(
      "Unable to submit transfer: " + error.message
    );

  } finally {
    if (exchangeRate > 0 && transferRouteReady) {
      submitButton.disabled = false;
      submitButton.textContent = "Submit Transfer Request";
    } else {
      submitButton.disabled = true;
      submitButton.textContent = "Exchange Rate Unavailable";
    }
  }
});

window.addEventListener("beforeunload", () => {
  if (historyUnsubscribe) {
    historyUnsubscribe();
  }

  stopExchangeRateRefresh();
});
