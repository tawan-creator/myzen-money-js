
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
  getDocs,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";


/* =====================================
   CONFIGURATION
===================================== */

// Demo payment accounts.
// Replace these with your real Admin payment details before accepting money.

const paymentAccounts = {
  "PromptPay": {
    bank: "PromptPay",
    accountNumber: "DEMO PROMPTPAY",
    holder: "DEMO ACCOUNT",
    type: "promptpay",
    notice: "Thailand PromptPay demo QR. This QR is not payable."
  },

  "TTB Bank": {
    bank: "TTB Bank",
    accountNumber: "2812528343",
    holder: "DEMO ACCOUNT",
    type: "bank",
    notice: "TTB demo account. Replace with your real bank details."
  },

  "KBZPay": {
    bank: "KBZPay",
    accountNumber: "09-000-000-000",
    holder: "DEMO ACCOUNT",
    type: "wallet",
    notice: "KBZPay demo account. Replace with your real account."
  },

  "WavePay": {
    bank: "WavePay",
    accountNumber: "09-000-000-000",
    holder: "DEMO ACCOUNT",
    type: "wallet",
    notice: "WavePay demo account. Replace with your real account."
  },

  "AYA Pay": {
    bank: "AYA Pay",
    accountNumber: "09-000-000-000",
    holder: "DEMO ACCOUNT",
    type: "wallet",
    notice: "AYA Pay demo account. Replace with your real account."
  },

  "Bank Transfer": {
    bank: "Bank Transfer",
    accountNumber: "Not configured",
    holder: "Not configured",
    type: "unconfigured",
    notice: "Please contact Admin for bank transfer details."
  }
};


/* =====================================
   DOM ELEMENTS
===================================== */

const depositForm = document.getElementById("depositForm");
const depositAmount = document.getElementById("depositAmount");
const methodSelect = document.getElementById("paymentMethod");
const transactionId = document.getElementById("transactionId");
const depositNote = document.getElementById("depositNote");
const depositMessage = document.getElementById("depositMessage");
const depositBtn = document.getElementById("depositBtn");

const currentBalance = document.getElementById("currentBalance");
const accountCurrency = document.getElementById("accountCurrency");
const accountCountry = document.getElementById("accountCountry");

const paymentInfo = document.getElementById("paymentInformation");
const paymentBank = document.getElementById("paymentBank");
const paymentAccountNumber = document.getElementById("paymentAccountNumber");
const paymentHolder = document.getElementById("paymentHolder");
const paymentNotice = document.getElementById("paymentNotice");

const copyButton = document.getElementById("copyAccountNumber");
const qrArea = document.getElementById("qrArea");
const qrContainer = document.getElementById("promptPayQR");

const depositHistory = document.getElementById("depositHistory");
const logoutBtn = document.getElementById("logoutBtn");


/* =====================================
   USER STATE
===================================== */

let currentUser = null;
let userCountry = "";
let userCurrency = "THB";
let userBalance = 0;


/* =====================================
   HELPERS
===================================== */

function showMessage(message, success = false) {
  if (!depositMessage) return;

  depositMessage.style.display = "block";
  depositMessage.textContent = message;

  depositMessage.style.background = success ? "#e7f8ed" : "#fee4e2";
  depositMessage.style.color = success ? "#067647" : "#b42318";
}

function currencySymbol(currency) {
  if (currency === "THB") return "฿";
  if (currency === "MMK") return "Ks";
  return currency;
}

function formatMoney(amount) {
  return Number(amount || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function normalizeCountry(country) {
  const value = String(country || "").trim().toLowerCase();

  if (
    value === "thailand" ||
    value === "ไทย" ||
    value === "th"
  ) {
    return "Thailand";
  }

  if (
    value === "myanmar" ||
    value === "burma" ||
    value === "မြန်မာ" ||
    value === "mm"
  ) {
    return "Myanmar";
  }

  return "";
}


/* =====================================
   COUNTRY PAYMENT METHODS
===================================== */

function loadPaymentMethods(country) {
  methodSelect.innerHTML = "";

  const firstOption = document.createElement("option");
  firstOption.value = "";
  firstOption.textContent = "Select Payment Method";
  methodSelect.appendChild(firstOption);

  let methods = [];

  if (country === "Thailand") {
    methods = [
      "PromptPay",
      "TTB Bank",
      "Bank Transfer"
    ];

    userCurrency = "THB";

  } else if (country === "Myanmar") {
    methods = [
      "KBZPay",
      "WavePay",
      "AYA Pay",
      "Bank Transfer"
    ];

    userCurrency = "MMK";

  } else {
    methods = [];
  }

  methods.forEach((method) => {
    const option = document.createElement("option");
    option.value = method;
    option.textContent = method;
    methodSelect.appendChild(option);
  });

  accountCurrency.textContent = userCurrency;

  if (country === "Thailand" || country === "Myanmar") {
    paymentInfo.style.display = "none";
  } else {
    paymentInfo.style.display = "none";
    showMessage(
      "Your account country is not configured. Please update your country in your profile."
    );
  }
}


/* =====================================
   DEMO PROMPTPAY QR
===================================== */

function generateDemoPromptPayQR() {
  qrContainer.innerHTML = "";

  if (typeof QRCode === "undefined") {
    qrContainer.textContent = "QR library could not load.";
    return;
  }

  // This is a demo QR payload, NOT a real PromptPay payment payload.
  const demoText = "MYZEN MONEY - DEMO ONLY - NOT FOR PAYMENT";

  new QRCode(qrContainer, {
    text: demoText,
    width: 210,
    height: 210,
    colorDark: "#000000",
    colorLight: "#ffffff",
    correctLevel: QRCode.CorrectLevel.H
  });
}


/* =====================================
   PAYMENT INFORMATION
===================================== */

function updatePaymentInformation() {
  const selectedMethod = methodSelect.value;

  // Never replace paymentInfo.innerHTML here.
  // Keeping its child elements prevents errors when switching methods.

  if (!selectedMethod) {
    paymentInfo.style.display = "none";
    qrArea.style.display = "none";
    return;
  }

  paymentInfo.style.display = "block";

  const account = paymentAccounts[selectedMethod];

  if (!account) {
    paymentBank.textContent = selectedMethod;
    paymentAccountNumber.textContent = "Not configured";
    paymentHolder.textContent = "Not configured";
    paymentNotice.textContent = "Payment details are not configured.";
    copyButton.style.display = "none";
    qrArea.style.display = "none";
    return;
  }

  paymentBank.textContent = account.bank;
  paymentAccountNumber.textContent = account.accountNumber;
  paymentHolder.textContent = account.holder;
  paymentNotice.textContent = account.notice;

  if (account.type === "promptpay") {
    qrArea.style.display = "block";
    copyButton.style.display = "none";
    generateDemoPromptPayQR();

  } else {
    qrArea.style.display = "none";

    if (account.type === "unconfigured") {
      copyButton.style.display = "none";
    } else {
      copyButton.style.display = "inline-block";
    }
  }
}

methodSelect.addEventListener("change", updatePaymentInformation);


/* =====================================
   COPY ACCOUNT NUMBER
===================================== */

copyButton.addEventListener("click", async () => {
  const method = methodSelect.value;
  const account = paymentAccounts[method];

  if (!account || account.type === "unconfigured") {
    showMessage("Account number is not available.");
    return;
  }

  try {
    await navigator.clipboard.writeText(account.accountNumber);
    showMessage("Account number copied successfully.", true);
  } catch (error) {
    showMessage("Unable to copy. Please copy the number manually.");
  }
});


/* =====================================
   LOAD USER PROFILE
===================================== */

async function loadUserProfile(user) {
  const userRef = doc(db, "users", user.uid);
  const userSnap = await getDoc(userRef);

  if (!userSnap.exists()) {
    throw new Error("User profile not found in Firestore.");
  }

  const profile = userSnap.data();

  userCountry = normalizeCountry(profile.country);

  userBalance = Number(profile.balance || 0);

  if (profile.currency) {
    userCurrency = profile.currency;
  } else if (userCountry === "Thailand") {
    userCurrency = "THB";
  } else if (userCountry === "Myanmar") {
    userCurrency = "MMK";
  }

  accountCountry.textContent = userCountry || profile.country || "Not configured";

  currentBalance.textContent = formatMoney(userBalance);
  accountCurrency.textContent = userCurrency;

  loadPaymentMethods(userCountry);
}


/* =====================================
   LOAD DEPOSIT HISTORY
===================================== */

async function loadDepositHistory(uid) {
  depositHistory.textContent = "Loading history...";

  try {
    const historyQuery = query(
      collection(db, "depositRequests"),
      where("uid", "==", uid),
      orderBy("createdAt", "desc")
    );

    const snapshot = await getDocs(historyQuery);

    if (snapshot.empty) {
      depositHistory.textContent = "No deposit history yet.";
      return;
    }

    depositHistory.innerHTML = "";

    snapshot.forEach((documentSnapshot) => {
      const data = documentSnapshot.data();

      const item = document.createElement("div");
      item.className = "history-item";

      const amount = document.createElement("strong");
      amount.textContent =
        `${currencySymbol(data.currency || userCurrency)} ${formatMoney(data.amount)}`;

      const method = document.createElement("div");
      method.textContent = `Method: ${data.paymentMethod || "-"}`;

      const reference = document.createElement("div");
      reference.textContent = `Reference: ${data.transactionId || "-"}`;

      const status = document.createElement("span");
      status.className = "status";
      status.textContent = data.status || "pending";

      item.appendChild(amount);
      item.appendChild(method);
      item.appendChild(reference);
      item.appendChild(status);

      depositHistory.appendChild(item);
    });

  } catch (error) {
    console.error("Deposit history error:", error);

    depositHistory.textContent =
      "Unable to load deposit history. Check Firestore rules and indexes.";
  }
}


/* =====================================
   SUBMIT DEPOSIT REQUEST
===================================== */

depositForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!currentUser) {
    showMessage("Please login first.");
    return;
  }

  const amount = Number(depositAmount.value);
  const method = methodSelect.value;
  const reference = transactionId.value.trim();
  const note = depositNote.value.trim();

  if (!Number.isFinite(amount) || amount <= 0) {
    showMessage("Please enter a valid deposit amount.");
    return;
  }

  if (!method) {
    showMessage("Please select a payment method.");
    return;
  }

  const account = paymentAccounts[method];

  if (!account || account.type === "unconfigured") {
    showMessage("This payment method is not configured yet. Please contact Admin.");
    return;
  }

  if (!reference) {
    showMessage("Please enter your transaction reference.");
    return;
  }

  // PromptPay QR is demo only; do not accept it as proof of payment.
  if (method === "PromptPay") {
    showMessage(
      "This is a DEMO PromptPay QR. Configure a real PromptPay receiver before accepting payments."
    );
    return;
  }

  depositBtn.disabled = true;
  depositBtn.textContent = "Submitting...";

  try {
    await addDoc(collection(db, "depositRequests"), {
      uid: currentUser.uid,
      amount: amount,
      currency: userCurrency,
      country: userCountry,
      paymentMethod: method,
      paymentBank: account.bank,
      transactionId: reference,
      note: note,
      status: "pending",
      createdAt: serverTimestamp()
    });

    showMessage(
      "Deposit request submitted successfully. Waiting for Admin approval.",
      true
    );

    depositForm.reset();
    paymentInfo.style.display = "none";

    await loadDepositHistory(currentUser.uid);

  } catch (error) {
    console.error("Deposit submit error:", error);
    showMessage("Deposit request failed: " + error.message);

  } finally {
    depositBtn.disabled = false;
    depositBtn.textContent = "Submit Deposit Request";
  }
});


/* =====================================
   LOGOUT
===================================== */

logoutBtn.addEventListener("click", async () => {
  try {
    await signOut(auth);
    window.location.href = "login.html";
  } catch (error) {
    showMessage("Logout failed: " + error.message);
  }
});


/* =====================================
   AUTH STATE
===================================== */

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  currentUser = user;

  try {
    await loadUserProfile(user);
    await loadDepositHistory(user.uid);

  } catch (error) {
    console.error("Profile loading error:", error);
    showMessage(error.message);
  }
});
