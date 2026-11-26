
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

  if (!Number.isFinite(value)) return "0.00 " + (currency || "");

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
  if (type === "international_transfer_refund") return "refund";
  if (type === "international_transfer") return "international_transfer";

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
    deposit: "↓",
    send: "↑",
    receive: "↓",
    international_transfer: "⇄",
    refund: "↩",
    other: "•"
  };

  return icons[getTransactionType(tx)] || "•";
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

  if (className) element.className = className;
  if (text !== undefined && text !== null) {
    element.textContent = String(text);
  }

  return element;
}

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
    const transaction = createElement("article", "transaction");
    const iconBox = createElement("div", "tx-icon", getTransactionIcon(tx));
    const info = createElement("div", "tx-info");

    const title = createElement("strong", "", getTransactionTitle(tx));
    const date = createElement(
      "small",
      "",
      formatDate(tx.createdAt || tx.timestamp)
    );

    const status = String(tx.status || "completed").toLowerCase();

    const statusElement = createElement(
      "span",
      "status " + status,
      status.replace(/_/g, " ")
    );

    info.appendChild(title);
    info.appendChild(date);
    info.appendChild(document.createElement("br"));
    info.appendChild(statusElement);

    const amountElement = createElement(
      "div",
      "tx-amount " + getAmountClass(tx),
      getAmountPrefix(tx) + formatAmount(tx.amount, tx.currency)
    );

    transaction.appendChild(iconBox);
    transaction.appendChild(info);
    transaction.appendChild(amountElement);

    els.list.appendChild(transaction);
  });
}

async function loadHistory(user) {
  try {
    els.message.textContent = "Loading transactions...";
    els.message.style.display = "block";
    els.list.replaceChildren();

    const token = await user.getIdToken();

    const response = await fetch(API_BASE_URL + "/api/history/my", {
      method: "GET",
      headers: {
        Authorization: "Bearer " + token
      }
    });

    const result = await response.json();

    if (!response.ok || result.success === false) {
      throw new Error(
        result.message || "Unable to load transaction history."
      );
    }

    if (!Array.isArray(result.transactions)) {
      throw new Error("Invalid history response from server.");
    }

    allTransactions = result.transactions;
    renderTransactions();

  } catch (error) {
    console.error("MYZEN HISTORY ERROR:", error);

    els.list.replaceChildren();
    els.message.style.display = "block";
    els.message.textContent =
      error.message || "Failed to load transaction history.";
  }
}

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

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  await loadHistory(user);
});
