
"use strict";

import { auth } from "./firebase.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

const API_BASE_URL = "https://myzen-money-js.onrender.com";

const $ = (id) => document.getElementById(id);

const els = {
  total: $("totalTransactions"),
  message: $("historyMessage"),
  list: $("transactionList"),
  filters: document.querySelectorAll(".filter")
};

let allTransactions = [];
let currentFilter = "all";

function formatAmount(amount, currency) {
  const value = Number(amount);

  if (!Number.isFinite(value)) {
    return "0.00 " + (currency || "");
  }

  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }) + " " + (currency || "");
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

function getTransactionType(tx) {
  const type = String(tx.type || "").toLowerCase();

  if (type === "deposit") return "deposit";

  if (type === "international_transfer_refund") {
    return "refund";
  }

  if (type === "international_transfer") {
    return "international_transfer";
  }

  if (type === "wallet_transfer" || tx.transferId) {
    return tx.direction === "credit" ? "receive" : "send";
  }

  if (type === "refund") return "refund";
  if (type === "send") return "send";
  if (type === "receive") return "receive";

  if (tx.direction === "credit") return "receive";
  if (tx.direction === "debit") return "send";

  return "other";
}

function getTransactionTitle(tx) {
  const titles = {
    deposit: "Deposit",
    send: "Send Money",
    receive: "Received Money",
    international_transfer: "International Transfer",
    refund: "Refund",
    other: "Transaction"
  };

  return titles[getTransactionType(tx)] || "Transaction";
}

function getTransactionIcon(tx) {
  const icons = {
    deposit: "\u2193",
    send: "\u2191",
    receive: "\u2193",
    international_transfer: "\u21C4",
    refund: "\u21A9",
    other: "\u2022"
  };

  return icons[getTransactionType(tx)] || "\u2022";
}

function getAmountClass(tx) {
  const type = getTransactionType(tx);

  return (
    type === "deposit" ||
    type === "receive" ||
    type === "refund"
  ) ? "credit" : "debit";
}

function getAmountPrefix(tx) {
  const type = getTransactionType(tx);

  if (
    type === "deposit" ||
    type === "receive" ||
    type === "refund"
  ) return "+";

  if (
    type === "send" ||
    type === "international_transfer"
  ) return "-";

  return "";
}

function createElement(tag, className, text) {
  const element = document.createElement(tag);

  if (className) {
    element.className = className;
  }

  if (text !== undefined && text !== null) {
    element.textContent = String(text);
  }

  return element;
}

// ==========================================
// ADMIN STATUS
// Approved = Complete
// Rejected = Reject
// Pending = Pending
// ==========================================

function normalizeStatus(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, "_");
}

function getStatus(tx) {
  // Prefer explicit admin approval fields.
  const adminStatus =
    tx.adminStatus ??
    tx.admin_status ??
    tx.adminApprovalStatus ??
    tx.admin_approval_status ??
    tx.approvalStatus ??
    tx.approval_status ??
    tx.reviewStatus ??
    tx.review_status;

  const rawStatus = normalizeStatus(
    adminStatus || tx.status || "pending"
  );

  const approvedStatuses = [
    "approved",
    "admin_approved",
    "complete",
    "completed",
    "success",
    "successful"
  ];

  const rejectedStatuses = [
    "reject",
    "rejected",
    "admin_rejected",
    "declined",
    "denied"
  ];

  const pendingStatuses = [
    "pending",
    "processing",
    "waiting",
    "under_review",
    "submitted"
  ];

  if (approvedStatuses.includes(rawStatus)) {
    return "Complete";
  }

  if (rejectedStatuses.includes(rawStatus)) {
    return "Rejected";
  }

  if (pendingStatuses.includes(rawStatus)) {
    return "Pending";
  }

  return rawStatus
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getStatusClass(status) {
  const normalized = normalizeStatus(status);

  if (normalized === "complete" || normalized === "completed") {
    return "completed";
  }

  if (normalized === "reject" || normalized === "rejected") {
    return "rejected";
  }

  if (normalized === "pending") {
    return "pending";
  }

  return normalized || "pending";
}

function getReference(tx) {
  return (
    tx.referenceId ||
    tx.reference ||
    tx.transactionId ||
    tx.transaction_id ||
    tx.transferId ||
    tx.depositId ||
    tx.id ||
    "Not available"
  );
}

function getFee(tx) {
  const fee = Number(
    tx.fee ??
    tx.feeAmount ??
    tx.transactionFee ??
    0
  );

  return Number.isFinite(fee) ? fee : 0;
}

function getTotal(tx) {
  const explicitTotal =
    tx.totalAmount ??
    tx.total ??
    tx.amountWithFee;

  if (
    explicitTotal !== undefined &&
    Number.isFinite(Number(explicitTotal))
  ) {
    return Number(explicitTotal);
  }

  return Number(tx.amount || 0) + getFee(tx);
}

function getFirstValue(tx, keys) {
  for (const key of keys) {
    const value = tx[key];

    if (
      value !== undefined &&
      value !== null &&
      String(value).trim() !== ""
    ) {
      return String(value);
    }
  }

  return "";
}

// ==========================================
// RECEIPT CSS
// ==========================================

function addReceiptStyles() {
  if ($("myzenReceiptStyles")) return;

  const style = document.createElement("style");
  style.id = "myzenReceiptStyles";

  style.textContent = `
    .myzen-receipt-overlay {
      position: fixed;
      inset: 0;
      z-index: 99999;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 15px;
      background: rgba(0,0,0,.82);
      backdrop-filter: blur(5px);
      overflow-y: auto;
    }

    .myzen-receipt {
      width: 100%;
      max-width: 460px;
      max-height: 94vh;
      overflow-y: auto;
      background: #151515;
      color: #eee5d0;
      border: 1px solid #9d7832;
      border-radius: 17px;
      box-shadow: 0 20px 70px rgba(0,0,0,.55);
      font-family: Arial, sans-serif;
    }

    .myzen-receipt-header {
      text-align: center;
      padding: 26px 20px 20px;
      background: linear-gradient(145deg,#242016,#101010);
      border-bottom: 1px solid #6b5329;
    }

    .myzen-receipt-logo {
      font-size: 23px;
      font-weight: 900;
      letter-spacing: 2px;
      color: #e2c16f;
    }

    .myzen-receipt-tagline {
      margin-top: 6px;
      color: #b9a77d;
      font-size: 11px;
      letter-spacing: 1px;
    }

    .myzen-receipt-title {
      margin-top: 22px;
      font-size: 18px;
      font-weight: 800;
      color: #f2dfad;
    }

    .myzen-receipt-status {
      display: inline-block;
      margin-top: 12px;
      padding: 7px 15px;
      border-radius: 30px;
      background: #3b301a;
      color: #e2c16f;
      border: 1px solid #98752e;
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
    }

    .myzen-receipt-status.completed {
      color: #9ee3b5;
      background: #183426;
      border-color: #34764c;
    }

    .myzen-receipt-status.rejected {
      color: #ffaaaa;
      background: #3a1b1b;
      border-color: #8b4242;
    }

    .myzen-receipt-status.pending {
      color: #e2c16f;
      background: #3b301a;
      border-color: #98752e;
    }

    .myzen-receipt-body {
      padding: 22px;
    }

    .myzen-receipt-amount {
      text-align: center;
      padding: 18px 10px;
      margin-bottom: 20px;
      border: 1px solid #5c4827;
      border-radius: 12px;
      background: #201d16;
    }

    .myzen-receipt-amount small {
      color: #b9a77d;
      font-size: 12px;
    }

    .myzen-receipt-amount strong {
      display: block;
      margin-top: 8px;
      font-size: 27px;
      color: #e2c16f;
      overflow-wrap: anywhere;
    }

    .myzen-receipt-section-title {
      margin: 20px 0 12px;
      color: #e2c16f;
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 1px;
      text-transform: uppercase;
    }

    .myzen-receipt-row {
      display: flex;
      justify-content: space-between;
      gap: 15px;
      padding: 10px 0;
      border-bottom: 1px solid #373126;
      font-size: 12px;
    }

    .myzen-receipt-row span:first-child {
      color: #ad9f80;
      flex-shrink: 0;
    }

    .myzen-receipt-row strong {
      text-align: right;
      color: #f1e7d0;
      overflow-wrap: anywhere;
      max-width: 65%;
    }

    .myzen-receipt-total {
      margin-top: 14px;
      padding: 15px 0;
      display: flex;
      justify-content: space-between;
      gap: 10px;
      border-top: 1px dashed #9d7832;
      border-bottom: 1px dashed #9d7832;
      font-size: 14px;
      font-weight: 900;
    }

    .myzen-receipt-total strong {
      color: #e2c16f;
      text-align: right;
    }

    .myzen-receipt-footer {
      text-align: center;
      padding: 18px;
      border-top: 1px solid #4c3b20;
      color: #a99a79;
      font-size: 11px;
      line-height: 1.7;
    }

    .myzen-receipt-actions {
      display: flex;
      gap: 10px;
      padding: 0 20px 20px;
    }

    .myzen-receipt-actions button {
      flex: 1;
      padding: 13px 10px;
      border: 0;
      border-radius: 9px;
      font-size: 13px;
      font-weight: 800;
      cursor: pointer;
    }

    .myzen-receipt-print {
      background: linear-gradient(135deg,#e4c477,#a77d2e);
      color: #17130b;
    }

    .myzen-receipt-close {
      background: #30291c;
      color: #e2c16f;
      border: 1px solid #765c2e !important;
    }

    @media print {
      @page {
        size: A4;
        margin: 12mm;
      }

      body * {
        visibility: hidden !important;
      }

      .myzen-receipt-overlay,
      .myzen-receipt-overlay * {
        visibility: visible !important;
      }

      .myzen-receipt-overlay {
        position: absolute !important;
        inset: 0 !important;
        padding: 0 !important;
        background: white !important;
        display: block !important;
        overflow: visible !important;
      }

      .myzen-receipt {
        max-width: 100% !important;
        max-height: none !important;
        overflow: visible !important;
        box-shadow: none !important;
        print-color-adjust: exact;
        -webkit-print-color-adjust: exact;
      }

      .myzen-receipt-actions {
        display: none !important;
      }
    }
  `;

  document.head.appendChild(style);
}

function addReceiptRow(container, label, value) {
  if (
    value === undefined ||
    value === null ||
    String(value).trim() === ""
  ) return;

  const row = createElement("div", "myzen-receipt-row");
  row.appendChild(createElement("span", "", label));
  row.appendChild(createElement("strong", "", value));

  container.appendChild(row);
}

function closeReceipt() {
  const overlay = $("myzenReceiptOverlay");

  if (overlay) {
    overlay.remove();
  }

  document.body.style.overflow = "";
}

// ==========================================
// OPEN RECEIPT
// ==========================================

function openReceipt(tx) {
  addReceiptStyles();
  closeReceipt();

  const overlay = createElement(
    "div",
    "myzen-receipt-overlay"
  );

  overlay.id = "myzenReceiptOverlay";

  const receipt = createElement("div", "myzen-receipt");

  const header = createElement(
    "div",
    "myzen-receipt-header"
  );

  header.appendChild(
    createElement("div", "myzen-receipt-logo", "MYZEN MONEY")
  );

  header.appendChild(
    createElement(
      "div",
      "myzen-receipt-tagline",
      "YOUR DIGITAL WALLET"
    )
  );

  header.appendChild(
    createElement(
      "div",
      "myzen-receipt-title",
      "TRANSACTION RECEIPT"
    )
  );

  const status = getStatus(tx);
  const statusClass = getStatusClass(status);

  header.appendChild(
    createElement(
      "span",
      "myzen-receipt-status " + statusClass,
      status
    )
  );

  const body = createElement(
    "div",
    "myzen-receipt-body"
  );

  const amountBox = createElement(
    "div",
    "myzen-receipt-amount"
  );

  amountBox.appendChild(
    createElement("small", "", getTransactionTitle(tx))
  );

  amountBox.appendChild(
    createElement(
      "strong",
      "",
      formatAmount(tx.amount, tx.currency)
    )
  );

  body.appendChild(amountBox);

  body.appendChild(
    createElement(
      "div",
      "myzen-receipt-section-title",
      "Transaction Details"
    )
  );

  addReceiptRow(
    body,
    "Reference ID",
    getReference(tx)
  );

  addReceiptRow(
    body,
    "Transaction Type",
    getTransactionTitle(tx)
  );

  addReceiptRow(
    body,
    "Date & Time",
    formatDate(tx.createdAt || tx.timestamp)
  );

  addReceiptRow(
    body,
    "Currency",
    tx.currency || "Not available"
  );

  addReceiptRow(
    body,
    "Status",
    status.toUpperCase()
  );

  const sender = getFirstValue(tx, [
    "senderName",
    "fromName",
    "sender",
    "from"
  ]);

  const recipient = getFirstValue(tx, [
    "recipientName",
    "receiverName",
    "toName",
    "recipient",
    "receiver",
    "to"
  ]);

  const account = getFirstValue(tx, [
    "accountNumber",
    "recipientAccount",
    "bankAccount",
    "account"
  ]);

  const bank = getFirstValue(tx, [
    "bankName",
    "recipientBank",
    "bank"
  ]);

  const note = getFirstValue(tx, [
    "note",
    "description",
    "remark"
  ]);

  if (sender || recipient || account || bank || note) {
    body.appendChild(
      createElement(
        "div",
        "myzen-receipt-section-title",
        "Transfer Information"
      )
    );

    addReceiptRow(body, "Sender", sender);
    addReceiptRow(body, "Recipient", recipient);
    addReceiptRow(body, "Bank", bank);
    addReceiptRow(body, "Account Number", account);
    addReceiptRow(body, "Note", note);
  }

  const fee = getFee(tx);
  const total = getTotal(tx);

  body.appendChild(
    createElement(
      "div",
      "myzen-receipt-section-title",
      "Payment Summary"
    )
  );

  const isInternationalTransfer =
    String(tx.type || "").toLowerCase().includes("international") &&
    !String(tx.type || "").toLowerCase().includes("refund");

  addReceiptRow(
    body,
    isInternationalTransfer ? "Send Amount" : "Amount",
    formatAmount(
      tx.sendAmount ?? tx.amount,
      tx.sendCurrency || tx.currency
    )
  );

  if (isInternationalTransfer && Number(tx.receiveAmount) > 0) {
    addReceiptRow(
      body,
      "Receive Amount",
      formatAmount(
        tx.receiveAmount,
        tx.receiveCurrency || ""
      )
    );
  }

  addReceiptRow(
    body,
    "Fee",
    formatAmount(fee, tx.currency)
  );

  const totalRow = createElement(
    "div",
    "myzen-receipt-total"
  );

  totalRow.appendChild(
    createElement("span", "", "TOTAL")
  );

  totalRow.appendChild(
    createElement(
      "strong",
      "",
      formatAmount(total, tx.currency)
    )
  );

  body.appendChild(totalRow);

  const footer = createElement(
    "div",
    "myzen-receipt-footer"
  );

  footer.appendChild(
    createElement("strong", "", "MYZEN MONEY")
  );

  footer.appendChild(
    createElement(
      "div",
      "",
      "Simple. Secure. Convenient."
    )
  );

  footer.appendChild(
    createElement(
      "div",
      "",
      "Thank you for using MYZEN MONEY."
    )
  );

  const actions = createElement(
    "div",
    "myzen-receipt-actions"
  );

  const printButton = createElement(
    "button",
    "myzen-receipt-print",
    "Print / Save PDF"
  );

  printButton.type = "button";

  printButton.addEventListener("click", () => {
    window.print();
  });

  const closeButton = createElement(
    "button",
    "myzen-receipt-close",
    "Close"
  );

  closeButton.type = "button";
  closeButton.addEventListener("click", closeReceipt);

  actions.appendChild(printButton);
  actions.appendChild(closeButton);

  receipt.appendChild(header);
  receipt.appendChild(body);
  receipt.appendChild(footer);
  receipt.appendChild(actions);

  overlay.appendChild(receipt);

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) {
      closeReceipt();
    }
  });

  document.body.appendChild(overlay);
  document.body.style.overflow = "hidden";
}

// ==========================================
// RENDER TRANSACTIONS
// ==========================================

function renderTransactions() {
  if (!els.list || !els.total || !els.message) return;

  const filtered = allTransactions.filter((tx) => {
    return currentFilter === "all" ||
      getTransactionType(tx) === currentFilter;
  });

  els.total.textContent = String(filtered.length);
  els.list.replaceChildren();

  if (filtered.length === 0) {
    els.message.textContent = "No transactions found.";
    els.message.style.display = "block";
    return;
  }

  els.message.style.display = "none";

  filtered.forEach((tx) => {
    const transaction = createElement(
      "article",
      "transaction"
    );

    transaction.setAttribute("role", "button");
    transaction.setAttribute("tabindex", "0");
    transaction.setAttribute(
      "aria-label",
      "View " + getTransactionTitle(tx) + " receipt"
    );

    const iconBox = createElement(
      "div",
      "tx-icon",
      getTransactionIcon(tx)
    );

    const info = createElement("div", "tx-info");

    const title = createElement(
      "strong",
      "",
      getTransactionTitle(tx)
    );

    const date = createElement(
      "small",
      "",
      formatDate(tx.createdAt || tx.timestamp)
    );

    const status = getStatus(tx);
    const statusClass = getStatusClass(status);

    const statusElement = createElement(
      "span",
      "status " + statusClass,
      status
    );

    info.appendChild(title);
    info.appendChild(date);
    info.appendChild(document.createElement("br"));
    info.appendChild(statusElement);

    const amountElement = createElement(
      "div",
      "tx-amount " + getAmountClass(tx),
      getAmountPrefix(tx) +
      formatAmount(tx.amount, tx.currency)
    );

    transaction.appendChild(iconBox);
    transaction.appendChild(info);
    transaction.appendChild(amountElement);

    transaction.addEventListener("click", () => {
      openReceipt(tx);
    });

    transaction.addEventListener("keydown", (event) => {
      if (
        event.key === "Enter" ||
        event.key === " "
      ) {
        event.preventDefault();
        openReceipt(tx);
      }
    });

    els.list.appendChild(transaction);
  });
}

// ==========================================
// LOAD HISTORY FROM BACKEND
// ==========================================

async function loadHistory(user) {
  try {
    els.message.textContent = "Loading transactions...";
    els.message.style.display = "block";
    els.list.replaceChildren();

    const token = await user.getIdToken();

    const response = await fetch(
      API_BASE_URL + "/api/history/my",
      {
        method: "GET",
        headers: {
          Authorization: "Bearer " + token
        }
      }
    );

    const result = await response.json();

    if (!response.ok || result.success === false) {
      throw new Error(
        result.message ||
        "Unable to load transaction history."
      );
    }

    if (!Array.isArray(result.transactions)) {
      throw new Error(
        "Invalid history response from server."
      );
    }

    allTransactions = result.transactions;
    renderTransactions();

  } catch (error) {
    console.error("MYZEN HISTORY ERROR:", error);

    els.list.replaceChildren();
    els.message.style.display = "block";

    els.message.textContent =
      error.message ||
      "Failed to load transaction history.";
  }
}

// ==========================================
// FILTER BUTTONS
// ==========================================

els.filters.forEach((button) => {
  button.addEventListener("click", () => {
    els.filters.forEach((item) => {
      item.classList.remove("active");
    });

    button.classList.add("active");

    currentFilter = button.dataset.filter || "all";

    renderTransactions();
  });
});

// ==========================================
// CLOSE RECEIPT WITH ESCAPE
// ==========================================

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeReceipt();
  }
});

// ==========================================
// FIREBASE AUTH
// ==========================================

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  await loadHistory(user);
});
