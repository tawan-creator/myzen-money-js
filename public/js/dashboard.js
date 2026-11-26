
import { auth, db } from "./firebase.js";

import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

import {
  doc,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

const API_BASE_URL = "https://myzen-money-js.onrender.com";

// ==========================================
// SETTINGS
// ==========================================

function getSettings() {
  try {
    return JSON.parse(localStorage.getItem("myzen_settings") || "{}");
  } catch {
    return {};
  }
}

function getTheme() {
  const settings = getSettings();
  const saved = settings.theme || localStorage.getItem("myzen_theme") || "dark";
  return saved === "dark" ? "dark" : "light";
}

function getLanguage() {
  const language = localStorage.getItem("myzen_language") || "en";
  return ["en", "my", "th"].includes(language) ? language : "en";
}

function applyTheme() {
  const theme = getTheme();
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

// ==========================================
// TRANSLATIONS
// ==========================================

const translations = {
  en: {
    "Loading...": "Loading...",
    "Loading account...": "Loading account...",
    "Account profile not found": "Account profile not found",
    "Your account profile does not exist in Firestore.": "Your account profile does not exist in Firestore.",
    "Not added": "Not added",
    "Account Approved": "Account Approved",
    "Waiting for Admin Approval": "Waiting for Admin Approval",
    "Your account is active. Welcome to MYZEN MONEY.": "Your account is active. Welcome to MYZEN MONEY.",
    "Your account is pending. Please wait for Admin approval.": "Your account is pending. Please wait for Admin approval.",
    "Unable to load account": "Unable to load account",
    "Logout Error: ": "Logout Error: ",
    "Welcome, ": "Welcome, ",
    "No transactions yet": "No transactions yet",
    "Your wallet activities will appear here.": "Your wallet activities will appear here.",
    "Loading activity...": "Loading activity...",
    "Unable to load activity": "Unable to load activity",
    "Money Transfer": "Money Transfer",
    "Money Receive": "Money Receive",
    "Withdraw": "Withdraw",
    "International Transfer": "International Transfer",
    "Deposit": "Deposit",
    "Activity Breakdown": "Activity Breakdown",
    "Total Activity": "Total Activity",
    "Latest Transactions": "Latest Transactions",
    "Complete": "Complete",
    "Reject": "Reject",
    "Pending": "Pending",
    "Unknown": "Unknown"
  },

  my: {
    "Loading...": "ဖွင့်နေသည်...",
    "Loading account...": "အကောင့်ဖွင့်နေသည်...",
    "Account profile not found": "အကောင့်အချက်အလက် မတွေ့ပါ",
    "Your account profile does not exist in Firestore.": "Firestore တွင် သင့်အကောင့်အချက်အလက် မရှိပါ။",
    "Not added": "မထည့်ရသေးပါ",
    "Account Approved": "အကောင့် အတည်ပြုပြီး",
    "Waiting for Admin Approval": "Admin အတည်ပြုချက် စောင့်ဆိုင်းနေသည်",
    "Your account is active. Welcome to MYZEN MONEY.": "သင့်အကောင့် အသုံးပြုနိုင်ပါပြီ။ MYZEN MONEY မှ ကြိုဆိုပါတယ်။",
    "Your account is pending. Please wait for Admin approval.": "သင့်အကောင့်သည် စောင့်ဆိုင်းဆဲဖြစ်သည်။ Admin အတည်ပြုချက်ကို စောင့်ပေးပါ။",
    "Unable to load account": "အကောင့်ဖွင့်၍ မရပါ",
    "Logout Error: ": "Logout ပြုလုပ်ရာတွင် အမှားဖြစ်သည်: ",
    "Welcome, ": "မင်္ဂလာပါ၊ ",
    "No transactions yet": "ငွေလွှဲမှတ်တမ်း မရှိသေးပါ",
    "Your wallet activities will appear here.": "သင့် Wallet လုပ်ဆောင်ချက်များ ဒီမှာ ပေါ်လာပါမယ်။",
    "Loading activity...": "ငွေလွှဲမှတ်တမ်း ဖွင့်နေသည်...",
    "Unable to load activity": "မှတ်တမ်းဖွင့်၍ မရပါ",
    "Money Transfer": "ငွေလွှဲခြင်း",
    "Money Receive": "ငွေလက်ခံခြင်း",
    "Withdraw": "ငွေထုတ်ခြင်း",
    "International Transfer": "နိုင်ငံတကာငွေလွှဲ",
    "Deposit": "ငွေသွင်းခြင်း",
    "Activity Breakdown": "ငွေလုပ်ဆောင်ချက် ရာခိုင်နှုန်း",
    "Total Activity": "စုစုပေါင်း လုပ်ဆောင်ချက်",
    "Latest Transactions": "နောက်ဆုံး ငွေလွှဲမှတ်တမ်း",
    "Complete": "ပြီးမြောက်",
    "Reject": "ငြင်းပယ်",
    "Pending": "စောင့်ဆိုင်းဆဲ",
    "Unknown": "မသိရှိပါ"
  },

  th: {
    "Loading...": "กำลังโหลด...",
    "Loading account...": "กำลังโหลดบัญชี...",
    "Account profile not found": "ไม่พบข้อมูลบัญชี",
    "Your account profile does not exist in Firestore.": "ไม่พบข้อมูลบัญชีของคุณใน Firestore",
    "Not added": "ยังไม่ได้เพิ่ม",
    "Account Approved": "บัญชีได้รับการอนุมัติแล้ว",
    "Waiting for Admin Approval": "กำลังรอการอนุมัติจากผู้ดูแลระบบ",
    "Your account is active. Welcome to MYZEN MONEY.": "บัญชีของคุณพร้อมใช้งานแล้ว ยินดีต้อนรับสู่ MYZEN MONEY",
    "Your account is pending. Please wait for Admin approval.": "บัญชีของคุณกำลังรอการอนุมัติ โปรดรอผู้ดูแลระบบ",
    "Unable to load account": "ไม่สามารถโหลดบัญชีได้",
    "Logout Error: ": "เกิดข้อผิดพลาดในการออกจากระบบ: ",
    "Welcome, ": "สวัสดี ",
    "No transactions yet": "ยังไม่มีรายการธุรกรรม",
    "Your wallet activities will appear here.": "กิจกรรมในกระเป๋าเงินของคุณจะแสดงที่นี่",
    "Loading activity...": "กำลังโหลดรายการ...",
    "Unable to load activity": "ไม่สามารถโหลดรายการได้",
    "Money Transfer": "โอนเงิน",
    "Money Receive": "รับเงิน",
    "Withdraw": "ถอนเงิน",
    "International Transfer": "โอนเงินระหว่างประเทศ",
    "Deposit": "ฝากเงิน",
    "Activity Breakdown": "สัดส่วนกิจกรรม",
    "Total Activity": "กิจกรรมทั้งหมด",
    "Latest Transactions": "รายการล่าสุด",
    "Complete": "สำเร็จ",
    "Reject": "ปฏิเสธ",
    "Pending": "รอดำเนินการ",
    "Unknown": "ไม่ทราบ"
  }
};

function t(key) {
  const language = getLanguage();
  return translations[language]?.[key] ?? translations.en[key] ?? key;
}

applyTheme();

// ==========================================
// HTML HELPERS
// ==========================================

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

function showMessage(message, color = "#64748b") {
  setText("dashboardMessage", message);

  const element = document.getElementById("dashboardMessage");
  if (element) element.style.color = color;
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

// ==========================================
// CURRENCY & DATE
// ==========================================

function formatAmount(amount, currency = "MMK") {
  const number = Math.abs(Number(amount) || 0);

  if (currency === "THB") {
    return "฿ " + number.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  if (currency === "USD") {
    return "$ " + number.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  return "Ks " + number.toLocaleString("en-US", {
    maximumFractionDigits: 2
  });
}

function getTransactionDate(transaction) {
  const value =
    transaction.createdAt ||
    transaction.timestamp ||
    transaction.date ||
    transaction.created_at;

  if (!value) return "";

  let date;

  if (value && typeof value.toDate === "function") {
    date = value.toDate();
  } else if (value && typeof value === "object" && value.seconds) {
    date = new Date(value.seconds * 1000);
  } else if (typeof value === "number") {
    date = new Date(value < 1000000000000 ? value * 1000 : value);
  } else {
    date = new Date(value);
  }

  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleString(getLanguage() === "my" ? "my-MM" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

// ==========================================
// TRANSACTION TYPE DETECTION
// ==========================================

function normalizeType(transaction) {
  return String(
    transaction.type ||
    transaction.transactionType ||
    transaction.transaction_type ||
    ""
  ).toLowerCase().replace(/[\s-]+/g, "_");
}

function getActivityCategory(transaction) {
  const type = normalizeType(transaction);

  if (
    type.includes("international_transfer") ||
    type.includes("international")
  ) {
    return "international";
  }

  if (
    type.includes("withdraw") ||
    type.includes("cash_out") ||
    type.includes("cashout")
  ) {
    return "withdraw";
  }

  if (
    type === "deposit" ||
    type.includes("deposit")
  ) {
    return "deposit";
  }

  if (
    type === "receive" ||
    type.includes("receive") ||
    type.includes("incoming")
  ) {
    return "receive";
  }

  if (
    type === "send" ||
    type.includes("send") ||
    type.includes("transfer")
  ) {
    const direction = String(transaction.direction || "").toLowerCase();

    if (direction === "credit" || direction === "in") {
      return "receive";
    }

    return "transfer";
  }

  const direction = String(transaction.direction || "").toLowerCase();

  if (direction === "credit" || direction === "in") {
    return "receive";
  }

  if (direction === "debit" || direction === "out") {
    return "transfer";
  }

  return null;
}

function getCategoryInfo(category) {
  const info = {
    transfer: {
      title: "Money Transfer",
      icon: "↗"
    },
    receive: {
      title: "Money Receive",
      icon: "↓"
    },
    withdraw: {
      title: "Withdraw",
      icon: "⇧"
    },
    international: {
      title: "International Transfer",
      icon: "⇄"
    },
    deposit: {
      title: "Deposit",
      icon: "+"
    }
  };

  return info[category] || {
    title: "Unknown",
    icon: "↔"
  };
}

// ==========================================
// TRANSACTION STATUS
// ==========================================

function getTransactionStatus(transaction) {
  const rawStatus =
    transaction.adminStatus ||
    transaction.admin_status ||
    transaction.adminApprovalStatus ||
    transaction.admin_approval_status ||
    transaction.approvalStatus ||
    transaction.approval_status ||
    transaction.reviewStatus ||
    transaction.review_status ||
    transaction.status ||
    "pending";

  const status = String(rawStatus).toLowerCase().trim();

  if ([
    "approved",
    "admin_approved",
    "complete",
    "completed",
    "success",
    "successful"
  ].includes(status)) {
    return {
      label: t("Complete"),
      className: "complete"
    };
  }

  if ([
    "reject",
    "rejected",
    "admin_rejected",
    "declined",
    "denied"
  ].includes(status)) {
    return {
      label: t("Reject"),
      className: "reject"
    };
  }

  return {
    label: t("Pending"),
    className: "pending"
  };
}

// ==========================================
// ACTIVITY SUMMARY
// ==========================================

function getTransactionAmount(transaction) {
  const amount = Number(
    transaction.amount ??
    transaction.transferAmount ??
    transaction.transfer_amount ??
    transaction.totalAmount ??
    0
  );

  return Number.isFinite(amount) ? Math.abs(amount) : 0;
}

function getTransactionCurrency(transaction) {
  return String(
    transaction.currency ||
    transaction.destinationCurrency ||
    transaction.destination_currency ||
    "MMK"
  ).toUpperCase();
}

function renderActivity(transactions) {
  const container = document.getElementById("recentTransactions");
  if (!container) return;

  if (!Array.isArray(transactions) || transactions.length === 0) {
    container.innerHTML = `
      <div class="empty-transactions">
        <div class="empty-icon">↔</div>
        <h3>${escapeHTML(t("No transactions yet"))}</h3>
        <p>${escapeHTML(t("Your wallet activities will appear here."))}</p>
      </div>
    `;
    return;
  }

  const categories = {
    transfer: { amount: 0, currency: "MMK" },
    receive: { amount: 0, currency: "MMK" },
    withdraw: { amount: 0, currency: "MMK" },
    international: { amount: 0, currency: "MMK" },
    deposit: { amount: 0, currency: "MMK" }
  };

  const normalizedTransactions = transactions
    .map((transaction) => {
      const category = getActivityCategory(transaction);

      return {
        ...transaction,
        _category: category,
        _amount: getTransactionAmount(transaction),
        _currency: getTransactionCurrency(transaction)
      };
    })
    .filter((transaction) => transaction._category);

  normalizedTransactions.forEach((transaction) => {
    const category = transaction._category;
    categories[category].amount += transaction._amount;
    categories[category].currency = transaction._currency;
  });

  const totalAmount = Object.values(categories)
    .reduce((sum, item) => sum + item.amount, 0);

  const categoryOrder = [
    "transfer",
    "receive",
    "withdraw",
    "international",
    "deposit"
  ];

  const summaryHTML = categoryOrder.map((category) => {
    const item = categories[category];

    if (item.amount <= 0) return "";

    const percent = totalAmount > 0
      ? (item.amount / totalAmount) * 100
      : 0;

    const info = getCategoryInfo(category);

    return `
      <div class="activity-stat">
        <div class="activity-stat-top">
          <span class="activity-stat-name">
            ${escapeHTML(t(info.title))}
          </span>
          <span class="activity-stat-percent">
            ${percent.toFixed(1)}%
          </span>
        </div>

        <div class="activity-stat-amount">
          ${escapeHTML(formatAmount(item.amount, item.currency))}
        </div>

        <div class="activity-progress">
          <div
            class="activity-progress-fill"
            style="width:${Math.min(100, percent)}%"
          ></div>
        </div>
      </div>
    `;
  }).join("");

  const summarySection = summaryHTML
    ? `
      <div class="activity-list-heading">
        ${escapeHTML(t("Activity Breakdown"))}
      </div>

      <div class="activity-summary">
        ${summaryHTML}
      </div>

      <div class="activity-total">
        <span>${escapeHTML(t("Total Activity"))}</span>
        <strong>${escapeHTML(formatAmount(totalAmount, "MMK"))}</strong>
      </div>
    `
    : "";

  const sortedTransactions = normalizedTransactions
    .sort((a, b) => {
      return getDateMilliseconds(b) - getDateMilliseconds(a);
    });

  const latestHTML = sortedTransactions.slice(0, 8).map((transaction) => {
    const info = getCategoryInfo(transaction._category);
    const status = getTransactionStatus(transaction);

    const isIncoming =
      transaction._category === "receive" ||
      transaction._category === "deposit";

    const sign = isIncoming ? "+" : "−";

    return `
      <div class="transaction-row">
        <div class="transaction-icon">
          ${escapeHTML(info.icon)}
        </div>

        <div class="transaction-info">
          <div class="transaction-title">
            ${escapeHTML(t(info.title))}
          </div>

          <div class="transaction-date">
            ${escapeHTML(getTransactionDate(transaction) || "—")}
          </div>
        </div>

        <div class="transaction-right">
          <div class="transaction-amount">
            ${sign}${escapeHTML(formatAmount(
              transaction._amount,
              transaction._currency
            ))}
          </div>

          <span class="transaction-status ${status.className}">
            ${escapeHTML(status.label)}
          </span>
        </div>
      </div>
    `;
  }).join("");

  container.innerHTML = `
    ${summarySection}

    <div class="activity-list-heading">
      ${escapeHTML(t("Latest Transactions"))}
    </div>

    ${
      latestHTML ||
      `<div class="empty-transactions">
        ${escapeHTML(t("No transactions yet"))}
      </div>`
    }
  `;
}

function getDateMilliseconds(transaction) {
  const value =
    transaction.createdAt ||
    transaction.timestamp ||
    transaction.date ||
    transaction.created_at;

  if (!value) return 0;

  if (value && typeof value.toDate === "function") {
    return value.toDate().getTime();
  }

  if (value && typeof value === "object" && value.seconds) {
    return value.seconds * 1000;
  }

  if (typeof value === "number") {
    return value < 1000000000000 ? value * 1000 : value;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

// ==========================================
// LOAD TRANSACTIONS FROM BACKEND
// ==========================================

let activityRequestNumber = 0;

async function loadTransactions(user) {
  const container = document.getElementById("recentTransactions");
  if (!container || !user) return;

  const requestNumber = ++activityRequestNumber;

  container.innerHTML = `
    <div class="empty-transactions">
      <div class="empty-icon">↔</div>
      <h3>${escapeHTML(t("Loading activity..."))}</h3>
    </div>
  `;

  try {
    const token = await user.getIdToken();

    const response = await fetch(
      `${API_BASE_URL}/api/history/my`,
      {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      }
    );

    const result = await response.json();

    if (requestNumber !== activityRequestNumber) return;

    if (!response.ok || result.success === false) {
      throw new Error(
        result.message || `History request failed (${response.status})`
      );
    }

    const transactions = Array.isArray(result.transactions)
      ? result.transactions
      : [];

    renderActivity(transactions);

  } catch (error) {
    console.error("MYZEN Dashboard Activity Error:", error);

    if (requestNumber !== activityRequestNumber) return;

    container.innerHTML = `
      <div class="empty-transactions">
        <div class="empty-icon">!</div>
        <h3>${escapeHTML(t("Unable to load activity"))}</h3>
        <p>${escapeHTML(error.message || "Please try again later.")}</p>
      </div>
    `;
  }
}

// ==========================================
// FIREBASE USER PROFILE
// ==========================================

let unsubscribeProfile = null;
let currentUser = null;

onAuthStateChanged(auth, (user) => {
  if (unsubscribeProfile) {
    unsubscribeProfile();
    unsubscribeProfile = null;
  }

  currentUser = user;

  if (!user) {
    window.location.href = "login.html";
    return;
  }

  setText("accountStatus", t("Loading account..."));
  setText("balance", t("Loading..."));

  const userRef = doc(db, "users", user.uid);

  unsubscribeProfile = onSnapshot(
    userRef,

    (snapshot) => {
      if (!snapshot.exists()) {
        setText("accountStatus", t("Account profile not found"));

        showMessage(
          t("Your account profile does not exist in Firestore."),
          "#dc2626"
        );

        return;
      }

      const data = snapshot.data();

      const name = data.name || user.displayName || "User";
      const country = data.country || "Myanmar";
      const currency =
        data.currency || (country === "Thailand" ? "THB" : "MMK");

      const balance = Number(data.balance || 0);
      const status = String(data.status || "pending").toLowerCase();

      // Balance
      if (currency === "THB") {
        setText(
          "balance",
          "฿ " + balance.toLocaleString("en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
          })
        );
      } else {
        setText(
          "balance",
          "Ks " + balance.toLocaleString("en-US")
        );
      }

      // Account approval
      if (status === "approved") {
        setText("accountStatus", t("Account Approved"));

        showMessage(
          t("Your account is active. Welcome to MYZEN MONEY."),
          "#16a34a"
        );

        document.querySelectorAll(".menu-item").forEach((item) => {
          item.style.pointerEvents = "auto";
          item.style.opacity = "1";
        });

        document.querySelectorAll(".quick-action").forEach((item) => {
          item.style.pointerEvents = "auto";
          item.style.opacity = "1";
        });

      } else {
        setText("accountStatus", t("Waiting for Admin Approval"));

        showMessage(
          t("Your account is pending. Please wait for Admin approval."),
          "#d97706"
        );

        document.querySelectorAll(".menu-item").forEach((item) => {
          item.style.pointerEvents = "none";
          item.style.opacity = "0.45";
        });

        document.querySelectorAll(".quick-action").forEach((item) => {
          item.style.pointerEvents = "none";
          item.style.opacity = "0.45";
        });
      }
    },

    (error) => {
      console.error("MYZEN Dashboard Error:", error);

      setText("accountStatus", t("Unable to load account"));
      showMessage("Firebase Error: " + error.code, "#dc2626");
    }
  );

  loadTransactions(user);
});

// ==========================================
// LOGOUT
// ==========================================

const logoutBtn = document.getElementById("logoutBtn");

if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    try {
      if (unsubscribeProfile) {
        unsubscribeProfile();
        unsubscribeProfile = null;
      }

      await signOut(auth);
      window.location.href = "login.html";

    } catch (error) {
      alert(t("Logout Error: ") + error.message);
    }
  });
}
