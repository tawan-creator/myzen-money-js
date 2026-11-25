import { auth } from "./firebase.js";

import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

const API_BASE_URL = "https://myzen-money-js.onrender.com";

const $ = (id) => document.getElementById(id);

const els = {
  message: $("adminMessage"),
  dashboard: $("dashboard"),
  logout: $("logoutBtn"),
  refresh: $("refreshDeposits"),
  deposits: $("depositList"),
  methodForm: $("methodForm"),
  methodId: $("methodId"),
  country: $("methodCountry"),
  currency: $("methodCurrency"),
  name: $("methodName"),
  bank: $("methodBank"),
  accountName: $("methodAccountName"),
  accountNumber: $("methodAccountNumber"),
  instructions: $("methodInstructions"),
  enabled: $("methodEnabled"),
  saveMethod: $("saveMethodBtn"),
  cancelEdit: $("cancelEditBtn"),
  methodMessage: $("methodMessage"),
  methods: $("methodList")
};

let currentUser = null;
let configuredMethods = [];

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

function setAdminMessage(message, type = "") {
  els.message.textContent = message;
  els.message.className = `message ${type}`;
}

function setMethodMessage(message, type = "") {
  els.methodMessage.textContent = message;
  els.methodMessage.className = `message ${type}`;
}

async function apiRequest(endpoint, options = {}) {
  if (!currentUser) throw new Error("Please sign in.");

  const token = await currentUser.getIdToken();

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
    throw new Error("Server returned an invalid response.");
  }

  if (!response.ok || data.success === false) {
    throw new Error(data.message || `Request failed (${response.status}).`);
  }

  return data;
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

function formatMoney(value, currency = "THB") {
  const amount = Number(value || 0);

  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: currency === "THB" ? 2 : 0,
    maximumFractionDigits: currency === "THB" ? 2 : 0
  }).format(amount) + " " + currency;
}

async function loadDeposits() {
  els.deposits.textContent = "Loading deposit requests...";

  const data = await apiRequest("/api/admin/deposits");
  const deposits = Array.isArray(data.deposits) ? data.deposits : [];

  if (!deposits.length) {
    els.deposits.innerHTML = '<div class="empty">No deposit requests found.</div>';
    return;
  }

  els.deposits.innerHTML = deposits.map((item) => {
    const id = escapeHTML(item.id);
    const status = String(item.status || "pending").toLowerCase();

    return `
      <article class="deposit-item" data-deposit-id="${id}">
        <div class="method-row">
          <h3>Deposit ${id}</h3>
          <span class="status ${escapeHTML(status)}">${escapeHTML(status)}</span>
        </div>

        <p><strong>User ID:</strong> ${escapeHTML(item.uid || "")}</p>
        <p><strong>Amount:</strong> ${escapeHTML(formatMoney(item.amount, item.currency || "THB"))}</p>
        <p><strong>Payment Method:</strong> ${escapeHTML(item.methodName || "")}</p>
        <p><strong>Transaction Reference:</strong> ${escapeHTML(item.transactionId || "")}</p>
        <p><strong>Submitted:</strong> ${escapeHTML(formatDate(item.createdAt))}</p>
        ${item.note ? `<p><strong>Note:</strong> ${escapeHTML(item.note)}</p>` : ""}

        <div class="actions">
          <button class="secondary proof-btn" type="button" data-id="${id}">View Payment Proof</button>
          ${status === "pending" ? `
            <button class="success approve-btn" type="button" data-id="${id}">Approve</button>
            <button class="danger reject-btn" type="button" data-id="${id}">Reject</button>
          ` : ""}
        </div>

        <div class="proof-container" id="proof-${id}"></div>
        <div class="message" id="deposit-message-${id}"></div>
      </article>
    `;
  }).join("");
}

async function viewProof(id, button) {
  button.disabled = true;
  button.textContent = "Loading...";

  try {
    const data = await apiRequest(
      `/api/admin/deposits/${encodeURIComponent(id)}/proof`
    );

    const proofUrl = data.url ||
      data.proofUrl ||
      data.secureUrl ||
      data.downloadUrl;

    if (!proofUrl) {
      throw new Error("The server did not return a proof image URL.");
    }

    const container = $(`proof-${id}`);

    container.innerHTML = `
      <p><strong>Payment Screenshot</strong></p>
      <a href="${escapeHTML(proofUrl)}" target="_blank" rel="noopener noreferrer">
        Open full-size screenshot
      </a>
      <img class="proof-image" src="${escapeHTML(proofUrl)}" alt="Payment proof">
    `;
  } catch (error) {
    $(`deposit-message-${id}`).textContent = error.message;
    $(`deposit-message-${id}`).className = "message error";
  } finally {
    button.disabled = false;
    button.textContent = "View Payment Proof";
  }
}

async function approveDeposit(id, button) {
  const confirmed = confirm(
    "Have you verified that the money was actually received in your account? Approve and credit this deposit?"
  );

  if (!confirmed) return;

  button.disabled = true;
  button.textContent = "Approving...";

  try {
    const data = await apiRequest(
      `/api/admin/deposits/${encodeURIComponent(id)}/approve`,
      { method: "POST" }
    );

    const message = data.message || "Deposit approved.";
    $(`deposit-message-${id}`).textContent = message;
    $(`deposit-message-${id}`).className = "message ok";

    await loadDeposits();
  } catch (error) {
    $(`deposit-message-${id}`).textContent = error.message;
    $(`deposit-message-${id}`).className = "message error";
    button.disabled = false;
    button.textContent = "Approve";
  }
}

async function rejectDeposit(id, button) {
  const reason = prompt("Enter the rejection reason:");

  if (reason === null) return;

  if (!reason.trim()) {
    alert("Please enter a rejection reason.");
    return;
  }

  button.disabled = true;
  button.textContent = "Rejecting...";

  try {
    const data = await apiRequest(
      `/api/admin/deposits/${encodeURIComponent(id)}/reject`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() })
      }
    );

    const message = data.message || "Deposit rejected.";
    $(`deposit-message-${id}`).textContent = message;
    $(`deposit-message-${id}`).className = "message ok";

    await loadDeposits();
  } catch (error) {
    $(`deposit-message-${id}`).textContent = error.message;
    $(`deposit-message-${id}`).className = "message error";
    button.disabled = false;
    button.textContent = "Reject";
  }
}

async function loadPaymentMethods() {
  els.methods.textContent = "Loading payment methods...";

  const data = await apiRequest("/api/admin/deposit/methods");
  configuredMethods = Array.isArray(data.methods) ? data.methods : [];

  if (!configuredMethods.length) {
    els.methods.innerHTML = '<div class="empty">No payment methods configured yet.</div>';
    return;
  }

  els.methods.innerHTML = configuredMethods.map((method) => `
    <div class="method-item">
      <div class="method-row">
        <strong>${escapeHTML(method.name)}</strong>
        <span class="status ${method.enabled ? "approved" : "rejected"}">
          ${method.enabled ? "Enabled" : "Disabled"}
        </span>
      </div>
      <p class="muted">${escapeHTML(method.country)} · ${escapeHTML(method.currency)}</p>
      <p><strong>Bank / Provider:</strong> ${escapeHTML(method.bank || "-")}</p>
      <p><strong>Account Name:</strong> ${escapeHTML(method.accountName || "")}</p>
      <p><strong>Account Number:</strong> ${escapeHTML(method.accountNumber || "")}</p>
      <p><strong>Instructions:</strong> ${escapeHTML(method.instructions || "-")}</p>
      <div class="actions">
        <button class="secondary edit-method-btn" type="button" data-id="${escapeHTML(method.id)}">Edit</button>
        <button class="secondary toggle-method-btn" type="button" data-id="${escapeHTML(method.id)}">
          ${method.enabled ? "Disable" : "Enable"}
        </button>
      </div>
    </div>
  `).join("");
}

function clearMethodForm() {
  els.methodForm.reset();
  els.methodId.value = "";
  els.enabled.checked = true;
  els.saveMethod.textContent = "Save Payment Method";
  setMethodMessage("");
}

function editMethod(id) {
  const method = configuredMethods.find((item) => item.id === id);
  if (!method) return;

  els.methodId.value = method.id;
  els.country.value = method.country || "Thailand";
  els.currency.value = method.currency || "THB";
  els.name.value = method.name || "";
  els.bank.value = method.bank || "";
  els.accountName.value = method.accountName || "";
  els.accountNumber.value = method.accountNumber || "";
  els.instructions.value = method.instructions || "";
  els.enabled.checked = method.enabled === true;
  els.saveMethod.textContent = "Update Payment Method";

  window.scrollTo({ top: els.methodForm.offsetTop, behavior: "smooth" });
}

async function savePaymentMethods() {
  const id = els.methodId.value.trim();

  const method = {
    id: id || `method_${Date.now()}`,
    country: els.country.value,
    currency: els.currency.value,
    name: els.name.value.trim(),
    bank: els.bank.value.trim(),
    accountName: els.accountName.value.trim(),
    accountNumber: els.accountNumber.value.trim(),
    instructions: els.instructions.value.trim(),
    enabled: els.enabled.checked
  };

  if (!method.name || !method.accountName || !method.accountNumber) {
    throw new Error("Please fill in the payment method, account name, and account number.");
  }

  const updatedMethods = [...configuredMethods];
  const existingIndex = updatedMethods.findIndex((item) => item.id === method.id);

  if (existingIndex >= 0) {
    updatedMethods[existingIndex] = method;
  } else {
    updatedMethods.push(method);
  }

  await apiRequest("/api/admin/deposit/methods", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ methods: updatedMethods })
  });

  clearMethodForm();
  await loadPaymentMethods();
  setMethodMessage("Payment methods saved successfully.", "ok");
}

async function toggleMethod(id) {
  const updatedMethods = configuredMethods.map((method) => {
    if (method.id !== id) return method;

    return { ...method, enabled: method.enabled !== true };
  });

  await apiRequest("/api/admin/deposit/methods", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ methods: updatedMethods })
  });

  await loadPaymentMethods();
}

els.deposits.addEventListener("click", async (event) => {
  const button = event.target.closest("button");
  if (!button) return;

  const id = button.dataset.id;
  if (!id) return;

  if (button.classList.contains("proof-btn")) {
    await viewProof(id, button);
  } else if (button.classList.contains("approve-btn")) {
    await approveDeposit(id, button);
  } else if (button.classList.contains("reject-btn")) {
    await rejectDeposit(id, button);
  }
});

els.methods.addEventListener("click", async (event) => {
  const button = event.target.closest("button");
  if (!button) return;

  const id = button.dataset.id;
  if (!id) return;

  if (button.classList.contains("edit-method-btn")) {
    editMethod(id);
    return;
  }

  if (button.classList.contains("toggle-method-btn")) {
    button.disabled = true;

    try {
      await toggleMethod(id);
    } catch (error) {
      alert(error.message);
      button.disabled = false;
    }
  }
});

els.methodForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  els.saveMethod.disabled = true;
  els.saveMethod.textContent = "Saving...";

  try {
    await savePaymentMethods();
  } catch (error) {
    setMethodMessage(error.message, "error");
  } finally {
    els.saveMethod.disabled = false;
    els.saveMethod.textContent = els.methodId.value
      ? "Update Payment Method"
      : "Save Payment Method";
  }
});

els.cancelEdit.addEventListener("click", clearMethodForm);

els.refresh.addEventListener("click", async () => {
  els.refresh.disabled = true;

  try {
    await loadDeposits();
  } catch (error) {
    setAdminMessage(error.message, "error");
  } finally {
    els.refresh.disabled = false;
  }
});

els.logout.addEventListener("click", async () => {
  try {
    await signOut(auth);
    window.location.href = "login.html";
  } catch (error) {
    alert("Unable to log out.");
  }
});

els.country.addEventListener("change", () => {
  if (els.country.value === "Myanmar") {
    els.currency.value = "MMK";
  } else {
    els.currency.value = "THB";
  }
});

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  currentUser = user;

  try {
    const tokenResult = await user.getIdTokenResult(true);

    if (tokenResult.claims.admin !== true) {
      setAdminMessage(
        "Admin permission required. This account does not currently have the Admin permission.",
        "error"
      );
      els.dashboard.classList.add("hidden");
      return;
    }

    if (user.email !== "tharwaiphyol@gmail.com") {
      setAdminMessage("This account is not the configured MYZEN MONEY administrator.", "error");
      els.dashboard.classList.add("hidden");
      return;
    }

    setAdminMessage(`Administrator access confirmed: ${user.email}`, "ok");
    els.dashboard.classList.remove("hidden");

    await Promise.all([
      loadDeposits(),
      loadPaymentMethods()
    ]);
  } catch (error) {
    console.error("Admin dashboard error:", error);
    setAdminMessage(error.message || "Unable to load Admin Dashboard.", "error");
    els.dashboard.classList.add("hidden");
  }
});