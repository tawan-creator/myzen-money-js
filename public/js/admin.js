
import { auth } from "./firebase.js";

import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

const API_BASE_URL = "https://myzen-money-js.onrender.com";
const ADMIN_EMAIL = "tharwaiphyol@gmail.com";

const $ = (id) => document.getElementById(id);

const els = {
  message: $("adminMessage"),
  dashboard: $("dashboard"),
  logout: $("logoutBtn"),

  refresh: $("refreshDeposits"),
  refreshMethods: $("refreshMethods"),
  deposits: $("depositList"),

  refreshInternationalTransfers: $("refreshInternationalTransfers"),
  internationalTransfers: $("internationalTransferList"),
  internationalTransferMessage: $("internationalTransferMessage"),

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
  methods: $("methodList"),

  qrFile: $("methodQrFile"),
  qrPreview: $("methodQrPreview"),
  uploadQr: $("uploadQrBtn"),
  qrMessage: $("qrMessage"),

  refreshRates: $("refreshRates"),
  thbToMmk: $("thbToMmk"),
  mmkToThb: $("mmkToThb"),
  saveThbRate: $("saveThbRate"),
  saveMmkRate: $("saveMmkRate"),
  thbRateCurrent: $("thbRateCurrent"),
  mmkRateCurrent: $("mmkRateCurrent"),
  rateMessage: $("rateMessage"),

  statTotal: $("statTotal"),
  statPending: $("statPending"),
  statApproved: $("statApproved"),
  statMethods: $("statMethods"),

  refreshUsers: $("refreshUsers"),
  userSearch: $("userSearch"),
  userList: $("userList"),
  userMessage: $("userMessage"),
  statTotalUsers: $("statTotalUsers"),
  statActiveUsers: $("statActiveUsers"),
  statApprovedUsers: $("statApprovedUsers"),
  statPendingUsers: $("statPendingUsers")
};

let currentUser = null;
let configuredMethods = [];
let depositRecords = [];
let internationalTransferRecords = [];
let userRecords = [];
let currentQrPreviewUrl = null;

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
  if (!els.message) return;
  els.message.textContent = message;
  els.message.className = `message ${type}`;
}

function setMethodMessage(message, type = "") {
  if (!els.methodMessage) return;
  els.methodMessage.textContent = message;
  els.methodMessage.className = `message ${type}`;
}

function setQrMessage(message, type = "") {
  if (!els.qrMessage) return;
  els.qrMessage.textContent = message;
  els.qrMessage.className = `message ${type}`;
}

function setRateMessage(message, type = "") {
  if (!els.rateMessage) return;
  els.rateMessage.textContent = message;
  els.rateMessage.className = `message ${type}`;
}

function setTransferMessage(message, type = "") {
  if (!els.internationalTransferMessage) return;
  els.internationalTransferMessage.textContent = message;
  els.internationalTransferMessage.className = `message ${type}`;
}

function setUserMessage(message, type = "") {
  if (!els.userMessage) return;
  els.userMessage.textContent = message;
  els.userMessage.className = `message ${type}`;
}

async function apiRequest(endpoint, options = {}) {
  if (!currentUser) {
    throw new Error("Please sign in.");
  }

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
    throw new Error(
      data.message || `Request failed (${response.status}).`
    );
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

  return Number.isNaN(date.getTime())
    ? "Date unavailable"
    : date.toLocaleString();
}

function formatMoney(value, currency = "THB") {
  const amount = Number(value || 0);

  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: currency === "THB" ? 2 : 0,
    maximumFractionDigits: currency === "THB" ? 2 : 0
  }).format(amount) + " " + currency;
}

function updateStats() {
  const total = depositRecords.length;

  const pending = depositRecords.filter(
    item => String(item.status || "pending").toLowerCase() === "pending"
  ).length;

  const approved = depositRecords.filter(
    item => String(item.status || "").toLowerCase() === "approved"
  ).length;

  const activeMethods = configuredMethods.filter(
    method => method.enabled === true
  ).length;

  if (els.statTotal) els.statTotal.textContent = total;
  if (els.statPending) els.statPending.textContent = pending;
  if (els.statApproved) els.statApproved.textContent = approved;
  if (els.statMethods) els.statMethods.textContent = activeMethods;
}

/* =====================================
   USER MANAGEMENT
===================================== */

function updateUserStats(stats = {}) {
  const approved = userRecords.filter(
    user => String(user.status || "").toLowerCase() === "approved"
  ).length;

  const pending = userRecords.filter(
    user => String(user.status || "").toLowerCase() === "pending"
  ).length;

  if (els.statTotalUsers) {
    els.statTotalUsers.textContent =
      Number(stats.totalUsers ?? userRecords.length);
  }

  if (els.statActiveUsers) {
    els.statActiveUsers.textContent =
      Number(stats.activeUsers ?? 0);
  }

  if (els.statApprovedUsers) {
    els.statApprovedUsers.textContent =
      Number(stats.approvedUsers ?? approved);
  }

  if (els.statPendingUsers) {
    els.statPendingUsers.textContent =
      Number(stats.pendingUsers ?? pending);
  }
}

function renderUsers() {
  if (!els.userList) return;

  const search = String(
    els.userSearch?.value || ""
  ).trim().toLowerCase();

  const filtered = userRecords.filter(user => {
    const name = String(user.name || "").toLowerCase();
    const email = String(user.email || "").toLowerCase();
    const uid = String(user.uid || "").toLowerCase();

    return (
      name.includes(search) ||
      email.includes(search) ||
      uid.includes(search)
    );
  });

  if (!filtered.length) {
    els.userList.innerHTML = search
      ? '<div class="empty">No matching users found.</div>'
      : '<div class="empty">No registered users found.</div>';
    return;
  }

  els.userList.innerHTML = filtered.map(user => {
    const status = String(
      user.status || "pending"
    ).toLowerCase();

    const safeStatus = [
      "approved",
      "pending",
      "rejected"
    ].includes(status) ? status : "unknown";

    const online = user.online === true;

    return `
      <article class="user-item">

        <div class="method-row">
          <h3>${escapeHTML(user.name || "Unnamed User")}</h3>

          <span class="status ${escapeHTML(safeStatus)}">
            ${escapeHTML(safeStatus)}
          </span>
        </div>

        <p>
          <strong>Email:</strong>
          ${escapeHTML(user.email || "-")}
        </p>

        <p>
          <strong>UID:</strong>
          ${escapeHTML(user.uid || "-")}
        </p>

        <p>
          <strong>Account Status:</strong>
          ${escapeHTML(safeStatus)}
        </p>

        <p>
          <strong>Online Status:</strong>
          <span class="status ${online ? "user-online" : "user-offline"}">
            ${online ? "Online" : "Offline"}
          </span>
        </p>

        <p>
          <strong>Registered:</strong>
          ${escapeHTML(formatDate(user.createdAt))}
        </p>

        <p>
          <strong>Last Sign In:</strong>
          ${escapeHTML(formatDate(user.lastSignInTime))}
        </p>

        ${status === "pending" ? `
          <div class="actions">
            <button
              class="success user-approve-btn"
              type="button"
              data-uid="${escapeHTML(user.uid)}">
              ✓ Approve User
            </button>
          </div>
        ` : ""}

      </article>
    `;
  }).join("");
}

async function loadUsers() {
  if (!els.userList) return;

  els.userList.textContent = "Loading registered users...";
  setUserMessage("Loading user records...");

  try {
    const data = await apiRequest("/api/admin/users");

    userRecords = Array.isArray(data.users)
      ? data.users
      : [];

    updateUserStats(data.stats || {});
    renderUsers();

    setUserMessage(
      `${userRecords.length} user record(s) loaded.`,
      "ok"
    );

  } catch (error) {
    els.userList.innerHTML = `
      <div class="message error">
        ${escapeHTML(error.message)}
      </div>
    `;

    setUserMessage(
      `Unable to load users: ${error.message}`,
      "error"
    );

    throw error;
  }
}

async function approveUser(uid, button) {
  const user = userRecords.find(item => item.uid === uid);

  if (!user) {
    alert("User not found.");
    return;
  }

  if (String(user.status).toLowerCase() !== "pending") {
    alert("This user is not pending approval.");
    return;
  }

  const confirmed = confirm(
    `Approve this account?\n\n` +
    `Name: ${user.name || "-"}\n` +
    `Email: ${user.email || "-"}\n\n` +
    `This will allow the user to access approved wallet features.`
  );

  if (!confirmed) return;

  button.disabled = true;
  button.textContent = "Approving...";

  try {
    const data = await apiRequest(
      `/api/admin/users/${encodeURIComponent(uid)}/approve`,
      { method: "POST" }
    );

    setUserMessage(
      data.message || "User approved successfully.",
      "ok"
    );

    await loadUsers();

  } catch (error) {
    setUserMessage(
      `Unable to approve user: ${error.message}`,
      "error"
    );

    button.disabled = false;
    button.textContent = "✓ Approve User";
  }
}

/* =====================================
   DEPOSIT MANAGEMENT
===================================== */

async function loadDeposits() {
  if (!els.deposits) return;

  els.deposits.textContent = "Loading deposit requests...";

  try {
    const data = await apiRequest("/api/admin/deposits");

    depositRecords = Array.isArray(data.deposits)
      ? data.deposits
      : [];

    if (!depositRecords.length) {
      els.deposits.innerHTML =
        '<div class="empty">No deposit requests found.</div>';
    } else {
      els.deposits.innerHTML = depositRecords.map((item) => {
        const id = escapeHTML(item.id);
        const status = String(item.status || "pending").toLowerCase();

        return `
          <article class="deposit-item">

            <div class="method-row">
              <h3>Deposit ${id}</h3>

              <span class="status ${escapeHTML(status)}">
                ${escapeHTML(status)}
              </span>
            </div>

            <p><strong>User ID:</strong> ${escapeHTML(item.uid || "")}</p>

            <p><strong>Amount:</strong>
              ${escapeHTML(formatMoney(item.amount, item.currency || "THB"))}
            </p>

            <p><strong>Payment Method:</strong>
              ${escapeHTML(item.methodName || "")}
            </p>

            <p><strong>Transaction Reference:</strong>
              ${escapeHTML(item.transactionId || "")}
            </p>

            <p><strong>Submitted:</strong>
              ${escapeHTML(formatDate(item.createdAt))}
            </p>

            ${item.note
              ? `<p><strong>Note:</strong> ${escapeHTML(item.note)}</p>`
              : ""
            }

            <div class="actions">

              <button
                class="secondary proof-btn"
                type="button"
                data-id="${id}">
                View Payment Proof
              </button>

              ${status === "pending" ? `
                <button
                  class="success approve-btn"
                  type="button"
                  data-id="${id}">
                  Approve
                </button>

                <button
                  class="danger reject-btn"
                  type="button"
                  data-id="${id}">
                  Reject
                </button>
              ` : ""}

            </div>

            <div class="proof-container" id="proof-${id}"></div>
            <div class="message" id="deposit-message-${id}"></div>

          </article>
        `;
      }).join("");
    }

    updateStats();
  } catch (error) {
    els.deposits.innerHTML =
      `<div class="message error">${escapeHTML(error.message)}</div>`;

    updateStats();
    throw error;
  }
}

async function viewProof(id, button) {
  button.disabled = true;
  button.textContent = "Loading...";

  try {
    const data = await apiRequest(
      `/api/admin/deposits/${encodeURIComponent(id)}/proof`
    );

    const proofUrl =
      data.url ||
      data.proofUrl ||
      data.secureUrl ||
      data.downloadUrl;

    if (!proofUrl) {
      throw new Error("The server did not return a proof image URL.");
    }

    const container = $(`proof-${id}`);

    if (!container) throw new Error("Proof container not found.");

    container.innerHTML = `
      <p><strong>Payment Screenshot</strong></p>

      <a
        href="${escapeHTML(proofUrl)}"
        target="_blank"
        rel="noopener noreferrer">
        Open full-size screenshot
      </a>

      <img
        class="proof-image"
        src="${escapeHTML(proofUrl)}"
        alt="Payment proof">
    `;
  } catch (error) {
    const message = $(`deposit-message-${id}`);

    if (message) {
      message.textContent = error.message;
      message.className = "message error";
    }
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

    const message = $(`deposit-message-${id}`);

    if (message) {
      message.textContent = data.message || "Deposit approved.";
      message.className = "message ok";
    }

    await loadDeposits();
  } catch (error) {
    const message = $(`deposit-message-${id}`);

    if (message) {
      message.textContent = error.message;
      message.className = "message error";
    }

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

    const message = $(`deposit-message-${id}`);

    if (message) {
      message.textContent = data.message || "Deposit rejected.";
      message.className = "message ok";
    }

    await loadDeposits();
  } catch (error) {
    const message = $(`deposit-message-${id}`);

    if (message) {
      message.textContent = error.message;
      message.className = "message error";
    }

    button.disabled = false;
    button.textContent = "Reject";
  }
}

/* =====================================
   INTERNATIONAL TRANSFER MANAGEMENT
===================================== */

async function loadInternationalTransfers() {
  if (!els.internationalTransfers) return;

  els.internationalTransfers.textContent =
    "Loading international transfers...";

  try {
    const data = await apiRequest(
      "/api/admin/international-transfers"
    );

    internationalTransferRecords = Array.isArray(data.transfers)
      ? data.transfers
      : [];

    if (!internationalTransferRecords.length) {
      els.internationalTransfers.innerHTML = `
        <div class="empty">
          No international transfer requests found.
        </div>
      `;

      setTransferMessage("Transfer list loaded.", "ok");
      return;
    }

    els.internationalTransfers.innerHTML =
      internationalTransferRecords.map((item) => {
        const id = escapeHTML(item.id);
        const status = String(item.status || "pending").toLowerCase();

        const sendCurrency = item.sendCurrency || "THB";
        const receiveCurrency = item.receiveCurrency || "MMK";

        return `
          <article class="transfer-item">

            <div class="method-row">
              <h3>International Transfer</h3>

              <span class="status ${escapeHTML(status)}">
                ${escapeHTML(status)}
              </span>
            </div>

            <p><strong>Transfer ID:</strong> ${id}</p>

            <div class="transfer-grid">

              <div class="transfer-detail">
                <strong>Sender Name</strong>
                <span>${escapeHTML(item.senderName || "-")}</span>
              </div>

              <div class="transfer-detail">
                <strong>Sender Email</strong>
                <span>${escapeHTML(item.senderEmail || "-")}</span>
              </div>

              <div class="transfer-detail">
                <strong>Sender UID</strong>
                <span>${escapeHTML(item.senderUid || "-")}</span>
              </div>

              <div class="transfer-detail">
                <strong>Transfer Date</strong>
                <span>${escapeHTML(formatDate(item.createdAt))}</span>
              </div>

              <div class="transfer-detail">
                <strong>From Country</strong>
                <span>${escapeHTML(item.fromCountry || "-")}</span>
              </div>

              <div class="transfer-detail">
                <strong>To Country</strong>
                <span>${escapeHTML(item.toCountry || "-")}</span>
              </div>

              <div class="transfer-detail">
                <strong>Send Amount</strong>
                <span>${escapeHTML(formatMoney(item.sendAmount, sendCurrency))}</span>
              </div>

              <div class="transfer-detail">
                <strong>Receive Amount</strong>
                <span>${escapeHTML(formatMoney(item.receiveAmount, receiveCurrency))}</span>
              </div>

              <div class="transfer-detail">
                <strong>Exchange Rate</strong>
                <span>
                  1 ${escapeHTML(sendCurrency)}
                  =
                  ${escapeHTML(item.exchangeRate ?? "-")}
                  ${escapeHTML(receiveCurrency)}
                </span>
              </div>

              <div class="transfer-detail">
                <strong>Recipient Bank</strong>
                <span>${escapeHTML(item.recipientBank || "-")}</span>
              </div>

              <div class="transfer-detail">
                <strong>Recipient Name</strong>
                <span>${escapeHTML(item.recipientName || "-")}</span>
              </div>

              <div class="transfer-detail">
                <strong>Account Number</strong>
                <span>${escapeHTML(item.accountNumber || "-")}</span>
              </div>

              <div class="transfer-detail">
                <strong>Recipient Phone</strong>
                <span>${escapeHTML(item.recipientPhone || "-")}</span>
              </div>

              <div class="transfer-detail">
                <strong>Note</strong>
                <span>${escapeHTML(item.note || "-")}</span>
              </div>

            </div>

            ${status === "pending" ? `
              <div class="transfer-actions">
                <button
                  class="success transfer-approve-btn"
                  type="button"
                  data-id="${id}">
                  Approve Transfer
                </button>

                <button
                  class="danger transfer-reject-btn"
                  type="button"
                  data-id="${id}">
                  Reject & Refund
                </button>
              </div>
            ` : ""}

            <div class="message" id="transfer-message-${id}"></div>

          </article>
        `;
      }).join("");

    setTransferMessage(
      `${internationalTransferRecords.length} transfer request(s) loaded.`,
      "ok"
    );

  } catch (error) {
    els.internationalTransfers.innerHTML = `
      <div class="message error">
        ${escapeHTML(error.message)}
      </div>
    `;

    setTransferMessage(error.message, "error");
    throw error;
  }
}

async function approveInternationalTransfer(id, button) {
  const transfer = internationalTransferRecords.find(
    item => item.id === id
  );

  if (!transfer) {
    alert("Transfer request not found.");
    return;
  }

  const confirmed = confirm(
    "IMPORTANT: Have you manually completed the external bank payout to the recipient?\n\n" +
    "Approving this request only changes its status to Approved.\n" +
    "It does NOT send money to the recipient's wallet or bank.\n\n" +
    "Only continue if the external payout has actually been completed."
  );

  if (!confirmed) return;

  button.disabled = true;
  button.textContent = "Approving...";

  try {
    const data = await apiRequest(
      `/api/admin/international-transfers/${encodeURIComponent(id)}/approve`,
      { method: "POST" }
    );

    setTransferMessage(
      data.message || "International transfer approved.",
      "ok"
    );

    await loadInternationalTransfers();

  } catch (error) {
    const message = $(`transfer-message-${id}`);

    if (message) {
      message.textContent = error.message;
      message.className = "message error";
    }

    button.disabled = false;
    button.textContent = "Approve Transfer";
  }
}

async function rejectInternationalTransfer(id, button) {
  const transfer = internationalTransferRecords.find(
    item => item.id === id
  );

  if (!transfer) {
    alert("Transfer request not found.");
    return;
  }

  const reason = prompt(
    "Enter the reason for rejecting this transfer:"
  );

  if (reason === null) return;

  if (!reason.trim()) {
    alert("Please enter a rejection reason.");
    return;
  }

  const confirmed = confirm(
    "Are you sure you want to reject this transfer?\n\n" +
    "The backend will automatically refund " +
    formatMoney(transfer.sendAmount, transfer.sendCurrency) +
    " to the sender's wallet.\n\n" +
    "The refund will be processed exactly once."
  );

  if (!confirmed) return;

  button.disabled = true;
  button.textContent = "Refunding...";

  try {
    const data = await apiRequest(
      `/api/admin/international-transfers/${encodeURIComponent(id)}/reject`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() })
      }
    );

    setTransferMessage(
      data.message || "Transfer rejected and sender refunded.",
      "ok"
    );

    await loadInternationalTransfers();

  } catch (error) {
    const message = $(`transfer-message-${id}`);

    if (message) {
      message.textContent = error.message;
      message.className = "message error";
    }

    button.disabled = false;
    button.textContent = "Reject & Refund";
  }
}

/* =====================================
   PAYMENT METHOD MANAGEMENT
===================================== */

function renderQrPreview(url) {
  if (!els.qrPreview) return;

  if (currentQrPreviewUrl) {
    URL.revokeObjectURL(currentQrPreviewUrl);
    currentQrPreviewUrl = null;
  }

  if (!url) {
    els.qrPreview.src = "";
    els.qrPreview.classList.add("hidden");
    return;
  }

  els.qrPreview.src = url;
  els.qrPreview.classList.remove("hidden");
}

async function loadPaymentMethods() {
  if (!els.methods) return;

  els.methods.textContent = "Loading payment methods...";

  try {
    const data = await apiRequest("/api/admin/deposit/methods");

    configuredMethods = Array.isArray(data.methods)
      ? data.methods
      : [];

    if (!configuredMethods.length) {
      els.methods.innerHTML =
        '<div class="empty">No payment methods configured yet.</div>';
    } else {
      els.methods.innerHTML = configuredMethods.map((method) => `
        <div class="method-item">

          <div class="method-row">
            <strong>${escapeHTML(method.name)}</strong>

            <span class="status ${method.enabled ? "approved" : "rejected"}">
              ${method.enabled ? "Enabled" : "Disabled"}
            </span>
          </div>

          <p class="muted">
            ${escapeHTML(method.country)} · ${escapeHTML(method.currency)}
          </p>

          <p><strong>Bank / Provider:</strong>
            ${escapeHTML(method.bank || "-")}
          </p>

          <p><strong>Account Name:</strong>
            ${escapeHTML(method.accountName || "")}
          </p>

          <p><strong>Account Number:</strong>
            ${escapeHTML(method.accountNumber || "")}
          </p>

          <p><strong>Instructions:</strong>
            ${escapeHTML(method.instructions || "-")}
          </p>

          ${method.qrUrl ? `
            <p><strong>Payment QR Code:</strong></p>
            <img
              class="qr-preview"
              src="${escapeHTML(method.qrUrl)}"
              alt="Payment QR Code">
          ` : `
            <p class="muted">No QR image uploaded.</p>
          `}

          <div class="actions">
            <button
              class="secondary edit-method-btn"
              type="button"
              data-id="${escapeHTML(method.id)}">
              Edit / Manage QR
            </button>

            <button
              class="secondary toggle-method-btn"
              type="button"
              data-id="${escapeHTML(method.id)}">
              ${method.enabled ? "Disable" : "Enable"}
            </button>
          </div>

        </div>
      `).join("");
    }

    updateStats();
  } catch (error) {
    els.methods.innerHTML =
      `<div class="message error">${escapeHTML(error.message)}</div>`;

    updateStats();
    throw error;
  }
}

function clearMethodForm() {
  if (!els.methodForm) return;

  els.methodForm.reset();

  els.methodId.value = "";
  els.enabled.checked = true;

  if (els.qrFile) els.qrFile.value = "";

  renderQrPreview("");

  setQrMessage("");
  setMethodMessage("");

  els.saveMethod.textContent = "Save Payment Method";
}

function editMethod(id) {
  const method = configuredMethods.find(item => item.id === id);

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

  if (els.qrFile) els.qrFile.value = "";

  renderQrPreview(method.qrUrl || "");

  setQrMessage(
    method.qrUrl
      ? "Current QR image loaded."
      : "No QR image uploaded for this method."
  );

  setMethodMessage(`Editing: ${method.name}`, "ok");

  window.scrollTo({
    top: els.methodForm.getBoundingClientRect().top + window.scrollY,
    behavior: "smooth"
  });
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
    throw new Error(
      "Please fill in the payment method, account name, and account number."
    );
  }

  const updatedMethods = [...configuredMethods];

  const existingIndex = updatedMethods.findIndex(
    item => item.id === method.id
  );

  if (existingIndex >= 0) {
    updatedMethods[existingIndex] = {
      ...updatedMethods[existingIndex],
      ...method
    };
  } else {
    updatedMethods.push(method);
  }

  await apiRequest("/api/admin/deposit/methods", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ methods: updatedMethods })
  });

  await loadPaymentMethods();

  clearMethodForm();

  setMethodMessage(
    "Payment methods saved successfully. Select Edit / Manage QR to upload a QR image.",
    "ok"
  );
}

async function toggleMethod(id) {
  const updatedMethods = configuredMethods.map(method => {
    if (method.id !== id) return method;

    return {
      ...method,
      enabled: method.enabled !== true
    };
  });

  await apiRequest("/api/admin/deposit/methods", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ methods: updatedMethods })
  });

  await loadPaymentMethods();
}

/* =====================================
   QR IMAGE UPLOAD
===================================== */

async function uploadPaymentQr() {
  const methodId = els.methodId.value.trim();
  const file = els.qrFile.files?.[0];

  if (!methodId) {
    throw new Error(
      "Please save the payment method first, then click Edit / Manage QR."
    );
  }

  if (!file) {
    throw new Error("Please select a QR image first.");
  }

  const allowedTypes = [
    "image/jpeg",
    "image/png",
    "image/webp"
  ];

  if (!allowedTypes.includes(file.type)) {
    throw new Error("Only JPG, PNG, and WEBP images are allowed.");
  }

  if (file.size > 5 * 1024 * 1024) {
    throw new Error("QR image must be 5 MB or smaller.");
  }

  const formData = new FormData();
  formData.append("qr", file);

  const data = await apiRequest(
    `/api/admin/deposit/methods/${encodeURIComponent(methodId)}/qr`,
    {
      method: "POST",
      body: formData
    }
  );

  await loadPaymentMethods();

  const updatedMethod = configuredMethods.find(
    item => item.id === methodId
  );

  if (updatedMethod) {
    renderQrPreview(updatedMethod.qrUrl || data.qrUrl || data.url || "");
  }

  els.qrFile.value = "";

  setQrMessage(
    data.message || "QR image uploaded successfully.",
    "ok"
  );
}

/* =====================================
   EXCHANGE RATE MANAGEMENT
===================================== */

function getRatesObject(data) {
  return (
    data.rates ||
    data.exchangeRates ||
    data.settings ||
    data
  );
}

function displayRate(value) {
  if (value === null || value === undefined || value === "") {
    return "Not set";
  }

  const number = Number(value);

  if (!Number.isFinite(number)) {
    return "Not set";
  }

  return number.toLocaleString("en-US", {
    maximumFractionDigits: 8
  });
}

async function loadExchangeRates() {
  setRateMessage("Loading exchange rates...");

  try {
    const data = await apiRequest("/api/admin/exchange-rates");
    const rates = getRatesObject(data);

    const thbRate = rates.thbToMmk ?? null;
    const mmkRate = rates.mmkToThb ?? null;

    els.thbRateCurrent.textContent =
      `Current rate: 1 THB = ${displayRate(thbRate)} MMK`;

    els.mmkRateCurrent.textContent =
      `Current rate: 1 MMK = ${displayRate(mmkRate)} THB`;

    els.thbToMmk.value = thbRate === null ? "" : thbRate;
    els.mmkToThb.value = mmkRate === null ? "" : mmkRate;

    setRateMessage("Exchange rates loaded.", "ok");
  } catch (error) {
    setRateMessage(
      `Unable to load exchange rates: ${error.message}`,
      "error"
    );

    throw error;
  }
}

async function saveExchangeRate(field, input, button, label) {
  const value = Number(input.value);

  if (
    input.value.trim() === "" ||
    !Number.isFinite(value) ||
    value <= 0 ||
    value > 1000000000
  ) {
    setRateMessage(
      `Enter a valid ${label} rate greater than 0.`,
      "error"
    );

    input.focus();
    return;
  }

  const originalText = button.textContent;

  button.disabled = true;
  button.textContent = "Saving...";

  try {
    await apiRequest("/api/admin/exchange-rates", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        [field]: value
      })
    });

    await loadExchangeRates();

    setRateMessage(
      `${label} rate saved successfully.`,
      "ok"
    );
  } catch (error) {
    setRateMessage(
      `Unable to save ${label} rate: ${error.message}`,
      "error"
    );
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

/* =====================================
   EVENT LISTENERS
===================================== */

if (els.deposits) {
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
}

if (els.userList) {
  els.userList.addEventListener("click", async (event) => {
    const button = event.target.closest(".user-approve-btn");
    if (!button) return;

    const uid = button.dataset.uid;
    if (!uid) return;

    await approveUser(uid, button);
  });
}

if (els.internationalTransfers) {
  els.internationalTransfers.addEventListener("click", async (event) => {
    const button = event.target.closest("button");
    if (!button) return;

    const id = button.dataset.id;
    if (!id) return;

    if (button.classList.contains("transfer-approve-btn")) {
      await approveInternationalTransfer(id, button);
    } else if (button.classList.contains("transfer-reject-btn")) {
      await rejectInternationalTransfer(id, button);
    }
  });
}

if (els.refreshInternationalTransfers) {
  els.refreshInternationalTransfers.addEventListener("click", async () => {
    els.refreshInternationalTransfers.disabled = true;
    els.refreshInternationalTransfers.textContent = "Refreshing...";

    try {
      await loadInternationalTransfers();
    } catch (error) {
      setTransferMessage(error.message, "error");
    } finally {
      els.refreshInternationalTransfers.disabled = false;
      els.refreshInternationalTransfers.textContent = "↻ Refresh Transfers";
    }
  });
}

if (els.methods) {
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
}

if (els.methodForm) {
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
}

if (els.cancelEdit) {
  els.cancelEdit.addEventListener("click", clearMethodForm);
}

if (els.refresh) {
  els.refresh.addEventListener("click", async () => {
    els.refresh.disabled = true;

    try {
      await loadDeposits();
    } catch (error) {
      setAdminMessage(
        `Deposit refresh failed: ${error.message}`,
        "error"
      );
    } finally {
      els.refresh.disabled = false;
    }
  });
}

if (els.refreshMethods) {
  els.refreshMethods.addEventListener("click", async () => {
    els.refreshMethods.disabled = true;

    try {
      await loadPaymentMethods();
      setMethodMessage("Payment methods refreshed.", "ok");
    } catch (error) {
      setMethodMessage(error.message, "error");
    } finally {
      els.refreshMethods.disabled = false;
    }
  });
}

if (els.qrFile) {
  els.qrFile.addEventListener("change", () => {
    const file = els.qrFile.files?.[0];
    if (!file) return;

    if (currentQrPreviewUrl) {
      URL.revokeObjectURL(currentQrPreviewUrl);
    }

    currentQrPreviewUrl = URL.createObjectURL(file);

    els.qrPreview.src = currentQrPreviewUrl;
    els.qrPreview.classList.remove("hidden");

    setQrMessage("Image selected. Click Upload / Replace QR Image.");
  });
}

if (els.uploadQr) {
  els.uploadQr.addEventListener("click", async () => {
    els.uploadQr.disabled = true;
    els.uploadQr.textContent = "Uploading...";

    try {
      await uploadPaymentQr();
    } catch (error) {
      setQrMessage(error.message, "error");
    } finally {
      els.uploadQr.disabled = false;
      els.uploadQr.textContent = "Upload / Replace QR Image";
    }
  });
}

if (els.refreshRates) {
  els.refreshRates.addEventListener("click", async () => {
    els.refreshRates.disabled = true;

    try {
      await loadExchangeRates();
    } catch (error) {
      console.error("Exchange rate refresh error:", error);
    } finally {
      els.refreshRates.disabled = false;
    }
  });
}

if (els.saveThbRate) {
  els.saveThbRate.addEventListener("click", async () => {
    await saveExchangeRate(
      "thbToMmk",
      els.thbToMmk,
      els.saveThbRate,
      "THB → MMK"
    );
  });
}

if (els.saveMmkRate) {
  els.saveMmkRate.addEventListener("click", async () => {
    await saveExchangeRate(
      "mmkToThb",
      els.mmkToThb,
      els.saveMmkRate,
      "MMK → THB"
    );
  });
}

if (els.userSearch) {
  els.userSearch.addEventListener("input", renderUsers);
}

if (els.refreshUsers) {
  els.refreshUsers.addEventListener("click", async () => {
    els.refreshUsers.disabled = true;
    els.refreshUsers.textContent = "Refreshing...";

    try {
      await loadUsers();
    } catch (error) {
      setUserMessage(error.message, "error");
    } finally {
      els.refreshUsers.disabled = false;
      els.refreshUsers.textContent = "↻ Refresh Users";
    }
  });
}

if (els.logout) {
  els.logout.addEventListener("click", async () => {
    try {
      await signOut(auth);
      window.location.href = "login.html";
    } catch {
      alert("Unable to log out.");
    }
  });
}

if (els.country) {
  els.country.addEventListener("change", () => {
    els.currency.value =
      els.country.value === "Myanmar" ? "MMK" : "THB";
  });
}

/* =====================================
   ADMIN AUTHENTICATION
===================================== */

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
        "Admin permission required. This account does not currently have Admin permission.",
        "error"
      );

      els.dashboard?.classList.add("hidden");
      return;
    }

    if (
      String(user.email || "").toLowerCase() !==
      ADMIN_EMAIL.toLowerCase()
    ) {
      setAdminMessage(
        "This account is not the configured MYZEN MONEY administrator.",
        "error"
      );

      els.dashboard?.classList.add("hidden");
      return;
    }

    setAdminMessage(
      `Administrator access confirmed: ${user.email}`,
      "ok"
    );

    els.dashboard?.classList.remove("hidden");

    const results = await Promise.allSettled([
      loadDeposits(),
      loadPaymentMethods(),
      loadExchangeRates(),
      loadInternationalTransfers(),
      loadUsers()
    ]);

    if (results.some(result => result.status === "rejected")) {
      setAdminMessage(
        "Admin access confirmed. Some dashboard data could not load. Check the error shown in each section.",
        "error"
      );
    }

  } catch (error) {
    console.error("Admin dashboard error:", error);

    setAdminMessage(
      error.message || "Unable to verify Admin Dashboard access.",
      "error"
    );

    els.dashboard?.classList.add("hidden");
  }
});
