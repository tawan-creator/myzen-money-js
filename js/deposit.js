
import { auth, db } from "./firebase.js";

import {
  onAuthStateChanged,
  signOut
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

const form = document.getElementById("depositForm");
const amountInput = document.getElementById("depositAmount");
const methodSelect = document.getElementById("paymentMethod");
const transactionInput = document.getElementById("transactionId");
const noteInput = document.getElementById("depositNote");

const message = document.getElementById("depositMessage");
const button = document.getElementById("depositBtn");
const balanceElement = document.getElementById("currentBalance");
const currencyElement = document.getElementById("accountCurrency");
const historyElement = document.getElementById("depositHistory");
const logoutBtn = document.getElementById("logoutBtn");

let currentUser = null;
let userCurrency = "MMK";
let userCountry = "Myanmar";
let currentBalance = 0;

function showMessage(text, color = "#dc2626") {
  message.textContent = text;
  message.style.color = color;
}

function currencyInfo(country, currency) {
  const code = String(currency || "").toUpperCase();

  if (code === "THB" || (!code && country === "Thailand")) {
    return { code: "THB", symbol: "฿" };
  }

  return { code: "MMK", symbol: "Ks " };
}

function formatMoney(amount) {
  const symbol = userCurrency === "THB" ? "฿" : "Ks ";
  return symbol + Number(amount || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function loadPaymentMethods(country) {
  const methods = country === "Thailand"
    ? ["PromptPay", "Bank Transfer"]
    : ["KBZPay", "WavePay", "AYA Pay", "Bank Transfer"];

  methodSelect.innerHTML = '<option value="">Select Payment Method</option>';

  methods.forEach((method) => {
    const option = document.createElement("option");
    option.value = method;
    option.textContent = method;
    methodSelect.appendChild(option);
  });
}

function loadDepositHistory(uid) {
  const requestsQuery = query(
    collection(db, "depositRequests"),
    where("uid", "==", uid),
    orderBy("createdAt", "desc")
  );

  onSnapshot(requestsQuery, (snapshot) => {
    historyElement.replaceChildren();

    if (snapshot.empty) {
      historyElement.textContent = "No deposit requests yet.";
      return;
    }

    snapshot.forEach((item) => {
      const data = item.data();

      const wrapper = document.createElement("div");
      wrapper.className = "transaction-row";

      const details = document.createElement("div");

      const method = document.createElement("strong");
      method.textContent = data.paymentMethod || "Deposit";

      const reference = document.createElement("div");
      reference.className = "text-muted";
      reference.textContent = "Reference: " + (data.transactionId || "-");

      const status = document.createElement("div");
      status.textContent = "Status: " + String(data.status || "pending").toUpperCase();

      details.append(method, reference, status);

      const amount = document.createElement("strong");
      amount.textContent = formatMoney(data.amount);

      wrapper.append(details, amount);
      historyElement.appendChild(wrapper);
    });
  }, (error) => {
    console.error("Deposit history error:", error);
    historyElement.textContent = "Unable to load deposit history: " + error.message;
  });
}

logoutBtn?.addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "login.html";
});

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  currentUser = user;

  try {
    const userRef = doc(db, "users", user.uid);
    const userSnapshot = await getDoc(userRef);

    if (!userSnapshot.exists()) {
      showMessage("User profile not found.");
      button.disabled = true;
      return;
    }

    const data = userSnapshot.data();

    userCountry = data.country || "Myanmar";
    const info = currencyInfo(userCountry, data.currency);
    userCurrency = info.code;
    currentBalance = Number(data.balance || 0);

    balanceElement.textContent = formatMoney(currentBalance);
    currencyElement.textContent = userCountry + " / " + userCurrency;

    loadPaymentMethods(userCountry);
    loadDepositHistory(user.uid);

    if (String(data.status).toLowerCase() !== "approved") {
      showMessage("Your account must be approved before depositing.");
      button.disabled = true;
    } else {
      button.disabled = false;
    }

  } catch (error) {
    console.error("Deposit initialization error:", error);
    showMessage("Unable to load account: " + error.message);
    button.disabled = true;
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!currentUser) {
    showMessage("Please login first.");
    return;
  }

  const amount = Number(amountInput.value);
  const paymentMethod = methodSelect.value;
  const transactionId = transactionInput.value.trim();
  const note = noteInput.value.trim();

  if (!Number.isFinite(amount) || amount <= 0) {
    showMessage("Please enter a valid deposit amount.");
    return;
  }

  if (!paymentMethod) {
    showMessage("Please select a payment method.");
    return;
  }

  if (transactionId.length < 3) {
    showMessage("Please enter a valid transaction reference.");
    return;
  }

  button.disabled = true;
  button.textContent = "Submitting...";

  try {
    await addDoc(collection(db, "depositRequests"), {
      uid: currentUser.uid,
      email: currentUser.email || "",
      amount,
      country: userCountry,
      currency: userCurrency,
      paymentMethod,
      transactionId,
      note,
      status: "pending",
      createdAt: serverTimestamp()
    });

    form.reset();

    showMessage(
      "Deposit request submitted. Please wait for Admin approval.",
      "#15803d"
    );

  } catch (error) {
    console.error("Deposit submission error:", error);
    showMessage("Unable to submit deposit: " + error.message);
  } finally {
    button.disabled = false;
    button.textContent = "Submit Deposit";
  }
});
