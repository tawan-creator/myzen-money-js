
import { auth, db } from "./firebase.js";

import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

import {
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

const API_BASE_URL = "https://myzen-money-js.onrender.com";

const $ = (id) => document.getElementById(id);

const els = {
  logout: $("logoutBtn"),
  balance: $("currentBalance"),
  country: $("accountCountry"),
  method: $("paymentMethod"),
  paymentInfo: $("paymentInformation"),
  form: $("depositForm"),
  amount: $("depositAmount"),
  transactionId: $("transactionId"),
  note: $("depositNote"),
  proof: $("proofFile"),
  preview: $("proofPreview"),
  submit: $("depositBtn"),
  message: $("depositMessage"),
  history: $("depositHistory")
};

let currentUser = null;
let currentMethods = [];
let selectedProfile = null;
let currentRates = {
  thbToMmk: null,
  mmkToThb: null
};

function showMessage(message, type = "") {
  els.message.textContent = message;
  els.message.className = `message ${type}`;
}

function money(value, currency = "THB") {
  const number = Number(value || 0);

  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: currency === "THB" ? 2 : 0,
    maximumFractionDigits: currency === "THB" ? 2 : 0
  }).format(number) + " " + currency;
}

function formatRate(value) {
  const number = Number(value);

  if (!Number.isFinite(number) || number <= 0) {
    return "Not set";
  }

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 6
  }).format(number);
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

function safeImageUrl(value) {
  try {
    const url = new URL(String(value || ""));

    if (url.protocol === "https:" || url.protocol === "http:") {
      return url.href;
    }
  } catch {
    // Invalid image URL.
  }

  return "";
}

async function getToken() {
  if (!currentUser) throw new Error("Please sign in again.");
  return currentUser.getIdToken();
}

async function apiRequest(endpoint, options = {}) {
  const token = await getToken();

  const headers = {
    Authorization: `Bearer ${token}`,
    ...(options.headers || {})
  };

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers
  });

  let data;

  try {
    data = await response.json();
  } catch {
    throw new Error("The server returned an invalid response.");
  }

  if (!response.ok || data.success === false) {
    throw new Error(data.message || `Request failed (${response.status}).`);
  }

  return data;
}

async function loadProfile() {
  const snapshot = await getDoc(doc(db, "users", currentUser.uid));

  if (!snapshot.exists()) {
    throw new Error("Your user profile was not found.");
  }

  selectedProfile = snapshot.data();

  const country = selectedProfile.country ||
    selectedProfile.accountCountry ||
    selectedProfile.selectedCountry ||
    "Thailand";

  const currency = selectedProfile.currency ||
    (String(country).toLowerCase().includes("myanmar") ? "MMK" : "THB");

  const balance = Number(selectedProfile.balance || 0);

  els.country.textContent = `${country} · ${currency}`;
  els.balance.textContent = money(balance, currency);

  return { country, currency, balance };
}

/* EXCHANGE RATES */

async function loadExchangeRates() {
  try {
    const data = await apiRequest("/api/exchange-rates");

    const rates = data.rates ||
      data.exchangeRates ||
      data;

    currentRates = {
      thbToMmk: rates.thbToMmk ?? null,
      mmkToThb: rates.mmkToThb ?? null
    };
  } catch (error) {
    console.warn("Exchange rates could not be loaded:", error.message);

    currentRates = {
      thbToMmk: null,
      mmkToThb: null
    };
  }
}

function renderExchangeRates() {
  return `
    <div style="
      margin-bottom:18px;
      padding:15px;
      border-radius:12px;
      background:rgba(232,189,104,.08);
      border:1px solid rgba(232,189,104,.2);
    ">
      <strong style="display:block;margin-bottom:10px;">
        Exchange Rates
      </strong>

      <p style="margin:6px 0;">
        <strong>1 THB =</strong>
        ${escapeHTML(formatRate(currentRates.thbToMmk))}
        MMK
      </p>

      <p style="margin:6px 0;">
        <strong>1 MMK =</strong>
        ${escapeHTML(formatRate(currentRates.mmkToThb))}
        THB
      </p>

      <small style="opacity:.7;">
        Rates are informational and do not automatically change your wallet balance.
      </small>
    </div>
  `;
}

/* PAYMENT METHOD AND QR */

function renderPaymentInformation(method) {
  const exchangeHTML = renderExchangeRates();

  if (!method) {
    els.paymentInfo.innerHTML = `
      ${exchangeHTML}
      <p>Select a payment method to view payment instructions and QR code.</p>
    `;
    return;
  }

  const accountNumber = method.accountNumber || "";
  const accountName = method.accountName || "";
  const bank = method.bank || "";
  const instructions = method.instructions || "";
  const qrUrl = safeImageUrl(method.qrUrl);

  els.paymentInfo.innerHTML = `
    ${exchangeHTML}

    <p><strong>Payment Method:</strong> ${escapeHTML(method.name)}</p>

    ${bank ? `
      <p><strong>Bank / Provider:</strong> ${escapeHTML(bank)}</p>
    ` : ""}

    ${accountName ? `
      <p><strong>Account Name:</strong> ${escapeHTML(accountName)}</p>
    ` : ""}

    ${accountNumber ? `
      <p><strong>Account Number:</strong></p>
      <div class="copy-row">
        <span id="receivingAccountNumber">
          ${escapeHTML(accountNumber)}
        </span>
        <button class="secondary" id="copyAccountNumber" type="button">
          Copy
        </button>
      </div>
    ` : ""}

    ${qrUrl ? `
      <div style="
        margin:18px 0;
        padding:15px;
        text-align:center;
        background:#fff;
        border-radius:12px;
      ">
        <p style="color:#111;font-weight:800;margin:0 0 12px;">
          Scan to Pay
        </p>

        <img
          src="${escapeHTML(qrUrl)}"
          alt="Payment QR Code"
          loading="lazy"
          style="
            display:block;
            width:100%;
            max-width:280px;
            height:auto;
            margin:auto;
            object-fit:contain;
          "
        >
      </div>
    ` : `
      <p class="muted">
        QR code is not available for this payment method.
      </p>
    `}

    ${instructions ? `
      <p>
        <strong>Instructions:</strong><br>
        ${escapeHTML(instructions).replace(/\n/g, "<br>")}
      </p>
    ` : ""}
  `;

  const copyButton = $("copyAccountNumber");

  if (copyButton) {
    copyButton.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(accountNumber);
        copyButton.textContent = "Copied";
      } catch {
        copyButton.textContent = "Copy failed";
      }
    });
  }
}

async function loadPaymentMethods() {
  const data = await apiRequest("/api/deposit/methods");

  currentMethods = Array.isArray(data.methods) ? data.methods : [];

  els.method.innerHTML =
    '<option value="">Select payment method</option>';

  if (!currentMethods.length) {
    els.method.innerHTML =
      '<option value="">No payment methods available</option>';

    renderPaymentInformation(null);
    return;
  }

  for (const method of currentMethods) {
    const option = document.createElement("option");
    option.value = method.id;
    option.textContent = method.name;
    els.method.appendChild(option);
  }

  els.method.value = "";
  renderPaymentInformation(null);
}

/* DEPOSIT HISTORY */

async function loadDepositHistory() {
  els.history.textContent = "Loading deposit history...";

  const data = await apiRequest("/api/deposits/my");
  const deposits = Array.isArray(data.deposits) ? data.deposits : [];

  if (!deposits.length) {
    els.history.innerHTML =
      '<div class="empty">No deposit requests yet.</div>';
    return;
  }

  els.history.innerHTML = deposits.map((item) => {
    const status = String(item.status || "pending").toLowerCase();
    const currency = item.currency || "THB";
    const date = formatDate(item.createdAt);

    return `
      <div class="history-item">
        <div>
          <strong>${escapeHTML(item.methodName || "Deposit")}</strong>
          <div class="muted">
            ${escapeHTML(item.transactionId || "")}
          </div>
          <span class="status ${escapeHTML(status)}">
            ${escapeHTML(status)}
          </span>
          <div class="muted">${escapeHTML(date)}</div>
        </div>

        <strong>${escapeHTML(money(item.amount, currency))}</strong>
      </div>
    `;
  }).join("");
}

function formatDate(value) {
  if (!value) return "Date unavailable";

  let date;

  if (typeof value === "string" || typeof value === "number") {
    date = new Date(value);
  } else if (value.seconds) {
    date = new Date(value.seconds * 1000);
  } else {
    return "Date unavailable";
  }

  if (Number.isNaN(date.getTime())) return "Date unavailable";

  return date.toLocaleString();
}

/* PAYMENT METHOD SELECTION */

els.method.addEventListener("change", () => {
  const method = currentMethods.find(
    (item) => item.id === els.method.value
  );

  renderPaymentInformation(method || null);
});

/* PAYMENT PROOF PREVIEW */

els.proof.addEventListener("change", () => {
  const file = els.proof.files?.[0];

  if (!file) {
    els.preview.removeAttribute("src");
    els.preview.style.display = "none";
    return;
  }

  const allowedTypes = [
    "image/jpeg",
    "image/png",
    "image/webp"
  ];

  if (!allowedTypes.includes(file.type)) {
    els.proof.value = "";
    els.preview.style.display = "none";
    showMessage("Please choose a JPG, PNG, or WEBP image.", "error");
    return;
  }

  if (file.size > 5 * 1024 * 1024) {
    els.proof.value = "";
    els.preview.style.display = "none";
    showMessage("Image must be 5 MB or smaller.", "error");
    return;
  }

  els.preview.src = URL.createObjectURL(file);
  els.preview.style.display = "block";
  showMessage("");
});

/* SUBMIT DEPOSIT */

els.form.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!currentUser) {
    showMessage("Please sign in again.", "error");
    return;
  }

  const amount = Number(els.amount.value);
  const methodId = els.method.value;
  const transactionId = els.transactionId.value.trim();
  const proof = els.proof.files?.[0];

  if (!Number.isFinite(amount) || amount <= 0) {
    showMessage("Enter a valid deposit amount.", "error");
    return;
  }

  if (!methodId) {
    showMessage("Please select a payment method.", "error");
    return;
  }

  if (!transactionId) {
    showMessage("Enter your transaction reference.", "error");
    return;
  }

  if (!proof) {
    showMessage("Please upload your payment screenshot.", "error");
    return;
  }

  if (proof.size > 5 * 1024 * 1024) {
    showMessage("Screenshot must be 5 MB or smaller.", "error");
    return;
  }

  const formData = new FormData();

  formData.append("amount", String(amount));
  formData.append("methodId", methodId);
  formData.append("transactionId", transactionId);
  formData.append("note", els.note.value.trim());
  formData.append("proof", proof);

  els.submit.disabled = true;
  els.submit.textContent = "Submitting...";

  showMessage("Uploading screenshot and submitting your request...");

  try {
    const result = await apiRequest("/api/deposits", {
      method: "POST",
      body: formData
    });

    showMessage(
      result.message ||
      "Deposit request submitted. Please wait for Admin verification.",
      "success"
    );

    els.form.reset();
    els.preview.removeAttribute("src");
    els.preview.style.display = "none";

    await loadDepositHistory();
    await loadProfile();
  } catch (error) {
    console.error("Deposit submission error:", error);

    showMessage(
      error.message || "Unable to submit deposit request.",
      "error"
    );
  } finally {
    els.submit.disabled = false;
    els.submit.textContent = "Submit Deposit Request";
  }
});

/* LOGOUT */

els.logout.addEventListener("click", async () => {
  try {
    await signOut(auth);
    window.location.href = "login.html";
  } catch (error) {
    console.error(error);
    alert("Unable to log out. Please try again.");
  }
});

/* AUTHENTICATION AND INITIALIZATION */

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  currentUser = user;

  try {
    await loadProfile();
    await loadExchangeRates();
    await loadPaymentMethods();
    await loadDepositHistory();
  } catch (error) {
    console.error("Deposit page initialization error:", error);

    showMessage(
      error.message || "Unable to load deposit information.",
      "error"
    );
  }
});
