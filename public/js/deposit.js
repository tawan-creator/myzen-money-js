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

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
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

function renderPaymentInformation(method) {
  if (!method) {
    els.paymentInfo.textContent = "Select a payment method to view payment instructions.";
    return;
  }

  const accountNumber = method.accountNumber || "";
  const accountName = method.accountName || "";
  const bank = method.bank || "";
  const instructions = method.instructions || "";

  els.paymentInfo.innerHTML = `
    <p><strong>Payment Method:</strong> ${escapeHTML(method.name)}</p>
    ${bank ? `<p><strong>Bank / Provider:</strong> ${escapeHTML(bank)}</p>` : ""}
    ${accountName ? `<p><strong>Account Name:</strong> ${escapeHTML(accountName)}</p>` : ""}
    ${accountNumber ? `
      <p><strong>Account Number:</strong></p>
      <div class="copy-row">
        <span id="receivingAccountNumber">${escapeHTML(accountNumber)}</span>
        <button class="secondary" id="copyAccountNumber" type="button">Copy</button>
      </div>
    ` : ""}
    ${instructions ? `<p><strong>Instructions:</strong><br>${escapeHTML(instructions).replace(/\n/g, "<br>")}</p>` : ""}
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

  els.method.innerHTML = '<option value="">Select payment method</option>';

  if (!currentMethods.length) {
    els.method.innerHTML = '<option value="">No payment methods available</option>';
    els.paymentInfo.textContent =
      "There are currently no active payment methods. Please contact support.";
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

async function loadDepositHistory() {
  els.history.textContent = "Loading deposit history...";

  const data = await apiRequest("/api/deposits/my");
  const deposits = Array.isArray(data.deposits) ? data.deposits : [];

  if (!deposits.length) {
    els.history.innerHTML = '<div class="empty">No deposit requests yet.</div>';
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
          <div class="muted">${escapeHTML(item.transactionId || "")}</div>
          <span class="status ${escapeHTML(status)}">${escapeHTML(status)}</span>
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

els.method.addEventListener("change", () => {
  const method = currentMethods.find((item) => item.id === els.method.value);
  renderPaymentInformation(method || null);
});

els.proof.addEventListener("change", () => {
  const file = els.proof.files?.[0];

  if (!file) {
    els.preview.removeAttribute("src");
    els.preview.style.display = "none";
    return;
  }

  const allowedTypes = ["image/jpeg", "image/png", "image/webp"];

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
      result.message || "Deposit request submitted. Please wait for Admin verification.",
      "success"
    );

    els.form.reset();
    els.preview.removeAttribute("src");
    els.preview.style.display = "none";

    await loadDepositHistory();
    await loadProfile();
  } catch (error) {
    console.error("Deposit submission error:", error);
    showMessage(error.message || "Unable to submit deposit request.", "error");
  } finally {
    els.submit.disabled = false;
    els.submit.textContent = "Submit Deposit Request";
  }
});

els.logout.addEventListener("click", async () => {
  try {
    await signOut(auth);
    window.location.href = "login.html";
  } catch (error) {
    console.error(error);
    alert("Unable to log out. Please try again.");
  }
});

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  currentUser = user;

  try {
    await loadProfile();
    await loadPaymentMethods();
    await loadDepositHistory();
  } catch (error) {
    console.error("Deposit page initialization error:", error);
    showMessage(error.message || "Unable to load deposit information.", "error");
  }
});