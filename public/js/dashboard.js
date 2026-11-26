
import { auth, db } from "./firebase.js";

import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

import {
  doc,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

// ==========================================
// MYZEN MONEY - DASHBOARD THEME & LANGUAGE
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
  const savedTheme =
    settings.theme ||
    localStorage.getItem("myzen_theme") ||
    "light";

  return savedTheme === "dark" ? "dark" : "light";
}

function getLanguage() {
  const language = localStorage.getItem("myzen_language") || "en";

  return ["en", "my", "th"].includes(language)
    ? language
    : "en";
}

// Apply theme immediately
function applyTheme() {
  document.documentElement.dataset.theme = getTheme();
  document.documentElement.style.colorScheme = getTheme();
}

// ==========================================
// TRANSLATIONS
// ==========================================

const translations = {
  en: {
    "MYZEN MONEY": "MYZEN MONEY",
    "YOUR PERSONAL WALLET": "YOUR PERSONAL WALLET",
    "Welcome to MYZEN MONEY": "Welcome to MYZEN MONEY",
    "Available Balance": "Available Balance",
    "TOTAL WALLET BALANCE": "TOTAL WALLET BALANCE",
    "Send Money": "Send Money",
    "Deposit": "Deposit",
    "Scan QR": "Scan QR",
    "Receive": "Receive",
    "Money Services": "Money Services",
    "Receive Money": "Receive Money",
    "Exchange Rate": "Exchange Rate",
    "My Banks": "My Banks",
    "History": "History",
    "Settings": "Settings",
    "About MYZEN": "About MYZEN",
    "Recent Transactions": "Recent Transactions",
    "Your latest wallet activities": "Your latest wallet activities",
    "View All": "View All",
    "No transactions yet": "No transactions yet",
    "Simple. Secure. Convenient.": "Simple. Secure. Convenient.",
    "Home": "Home",
    "Profile": "Profile",
    "YOUR PERSONAL WALLET": "YOUR PERSONAL WALLET",
    "Profile": "Profile",
    "Loading account...": "Loading account...",
    "Loading...": "Loading...",
    "Account profile not found": "Account profile not found",
    "Your account profile does not exist in Firestore.": "Your account profile does not exist in Firestore.",
    "Not added": "Not added",
    "Account Approved": "Account Approved",
    "Waiting for Admin Approval": "Waiting for Admin Approval",
    "Your account is active. Welcome to MYZEN MONEY.": "Your account is active. Welcome to MYZEN MONEY.",
    "Your account is pending. Please wait for Admin approval.": "Your account is pending. Please wait for Admin approval.",
    "Unable to load account": "Unable to load account",
    "Logout Error: ": "Logout Error: ",
    "Welcome, ": "Welcome, "
  },

  my: {
    "MYZEN MONEY": "MYZEN MONEY",
    "YOUR PERSONAL WALLET": "သင့်ကိုယ်ပိုင် Digital Wallet",
    "Welcome to MYZEN MONEY": "MYZEN MONEY မှ ကြိုဆိုပါတယ်",
    "Available Balance": "လက်ကျန်ငွေ",
    "TOTAL WALLET BALANCE": "စုစုပေါင်း Wallet လက်ကျန်ငွေ",
    "Send Money": "ငွေလွှဲမည်",
    "Deposit": "ငွေသွင်းမည်",
    "Scan QR": "QR ဖတ်မည်",
    "Receive": "ငွေလက်ခံမည်",
    "Money Services": "ငွေကြေးဝန်ဆောင်မှုများ",
    "Receive Money": "ငွေလက်ခံမည်",
    "Exchange Rate": "ငွေလဲနှုန်း",
    "My Banks": "ကျွန်ုပ်၏ ဘဏ်များ",
    "History": "မှတ်တမ်း",
    "Settings": "ဆက်တင်များ",
    "About MYZEN": "MYZEN အကြောင်း",
    "Recent Transactions": "လတ်တလော ငွေလွှဲမှတ်တမ်း",
    "Your latest wallet activities": "သင့် Wallet ၏ နောက်ဆုံးလုပ်ဆောင်ချက်များ",
    "View All": "အားလုံးကြည့်ရန်",
    "No transactions yet": "ငွေလွှဲမှတ်တမ်း မရှိသေးပါ",
    "Simple. Secure. Convenient.": "ရိုးရှင်း၊ လုံခြုံ၊ အဆင်ပြေ",
    "Home": "ပင်မ",
    "Profile": "ကိုယ်ရေးအချက်အလက်",
    "Loading account...": "အကောင့်ဖွင့်နေသည်...",
    "Loading...": "ဖွင့်နေသည်...",
    "Account profile not found": "အကောင့်အချက်အလက် မတွေ့ပါ",
    "Your account profile does not exist in Firestore.": "Firestore တွင် သင့်အကောင့်အချက်အလက် မရှိပါ။",
    "Not added": "မထည့်ရသေးပါ",
    "Account Approved": "အကောင့် အတည်ပြုပြီး",
    "Waiting for Admin Approval": "Admin အတည်ပြုချက် စောင့်ဆိုင်းနေသည်",
    "Your account is active. Welcome to MYZEN MONEY.": "သင့်အကောင့် အသုံးပြုနိုင်ပါပြီ။ MYZEN MONEY မှ ကြိုဆိုပါတယ်။",
    "Your account is pending. Please wait for Admin approval.": "သင့်အကောင့်သည် စောင့်ဆိုင်းဆဲဖြစ်သည်။ Admin အတည်ပြုချက်ကို စောင့်ပေးပါ။",
    "Unable to load account": "အကောင့်ဖွင့်၍ မရပါ",
    "Logout Error: ": "Logout ပြုလုပ်ရာတွင် အမှားဖြစ်သည်: ",
    "Welcome, ": "မင်္ဂလာပါ၊ "
  },

  th: {
    "MYZEN MONEY": "MYZEN MONEY",
    "YOUR PERSONAL WALLET": "กระเป๋าเงินส่วนตัวของคุณ",
    "Welcome to MYZEN MONEY": "ยินดีต้อนรับสู่ MYZEN MONEY",
    "Available Balance": "ยอดเงินคงเหลือ",
    "TOTAL WALLET BALANCE": "ยอดเงินในกระเป๋าทั้งหมด",
    "Send Money": "โอนเงิน",
    "Deposit": "ฝากเงิน",
    "Scan QR": "สแกน QR",
    "Receive": "รับเงิน",
    "Money Services": "บริการทางการเงิน",
    "Receive Money": "รับเงิน",
    "Exchange Rate": "อัตราแลกเปลี่ยน",
    "My Banks": "ธนาคารของฉัน",
    "History": "ประวัติ",
    "Settings": "การตั้งค่า",
    "About MYZEN": "เกี่ยวกับ MYZEN",
    "Recent Transactions": "รายการล่าสุด",
    "Your latest wallet activities": "กิจกรรมล่าสุดในกระเป๋าเงินของคุณ",
    "View All": "ดูทั้งหมด",
    "No transactions yet": "ยังไม่มีรายการธุรกรรม",
    "Simple. Secure. Convenient.": "ง่าย ปลอดภัย สะดวก",
    "Home": "หน้าหลัก",
    "Profile": "โปรไฟล์",
    "Loading account...": "กำลังโหลดบัญชี...",
    "Loading...": "กำลังโหลด...",
    "Account profile not found": "ไม่พบข้อมูลบัญชี",
    "Your account profile does not exist in Firestore.": "ไม่พบข้อมูลบัญชีของคุณใน Firestore",
    "Not added": "ยังไม่ได้เพิ่ม",
    "Account Approved": "บัญชีได้รับการอนุมัติแล้ว",
    "Waiting for Admin Approval": "กำลังรอการอนุมัติจากผู้ดูแลระบบ",
    "Your account is active. Welcome to MYZEN MONEY.": "บัญชีของคุณพร้อมใช้งานแล้ว ยินดีต้อนรับสู่ MYZEN MONEY",
    "Your account is pending. Please wait for Admin approval.": "บัญชีของคุณกำลังรอการอนุมัติ โปรดรอผู้ดูแลระบบ",
    "Unable to load account": "ไม่สามารถโหลดบัญชีได้",
    "Logout Error: ": "เกิดข้อผิดพลาดในการออกจากระบบ: ",
    "Welcome, ": "สวัสดี "
  }
};

function translate(key) {
  const language = getLanguage();
  return translations[language]?.[key] ?? translations.en[key] ?? key;
}

// Translate existing page text without changing HTML structure
function translateTextNode(node) {
  if (!node || node.nodeType !== Node.TEXT_NODE) return;

  const original = node.nodeValue;
  const trimmed = original.trim();

  if (!trimmed) return;

  const translated = translate(trimmed);

  if (translated !== trimmed) {
    const leading = original.match(/^\s*/)?.[0] || "";
    const trailing = original.match(/\s*$/)?.[0] || "";
    node.nodeValue = leading + translated + trailing;
  }
}

function applyLanguage() {
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT
  );

  const textNodes = [];

  while (walker.nextNode()) {
    textNodes.push(walker.currentNode);
  }

  textNodes.forEach(translateTextNode);

  document.documentElement.lang = getLanguage();
}

// ==========================================
// SAFE HTML ELEMENT ACCESS
// ==========================================

function setText(id, value) {
  const element = document.getElementById(id);

  if (element) {
    element.textContent = value;
  }
}

function showMessage(message, color = "#64748b") {
  setText("dashboardMessage", message);

  const element = document.getElementById("dashboardMessage");

  if (element) {
    element.style.color = color;
  }
}

// ==========================================
// INITIALIZE SETTINGS
// ==========================================

applyTheme();
applyLanguage();

// ==========================================
// FIREBASE USER PROFILE
// ==========================================

let unsubscribeProfile = null;

onAuthStateChanged(auth, (user) => {
  if (unsubscribeProfile) {
    unsubscribeProfile();
    unsubscribeProfile = null;
  }

  if (!user) {
    window.location.href = "login.html";
    return;
  }

  setText("accountStatus", translate("Loading account..."));
  setText("balance", translate("Loading..."));
  setText("headerName", user.displayName || "User");
  setText(
    "welcomeText",
    translate("Welcome to MYZEN MONEY")
  );

  const userRef = doc(db, "users", user.uid);

  unsubscribeProfile = onSnapshot(
    userRef,

    (snapshot) => {
      if (!snapshot.exists()) {
        setText(
          "accountStatus",
          translate("Account profile not found")
        );

        showMessage(
          translate("Your account profile does not exist in Firestore."),
          "#dc2626"
        );

        return;
      }

      const data = snapshot.data();

      const name = data.name || user.displayName || "User";
      const email = data.email || user.email || "-";
      const phone = data.phone || translate("Not added");
      const country = data.country || "Myanmar";
      const currency =
        data.currency || (country === "Thailand" ? "THB" : "MMK");

      const balance = Number(data.balance || 0);
      const status = String(data.status || "pending").toLowerCase();

      // User information
      setText("headerName", name);

      setText(
        "welcomeText",
        translate("Welcome, ") + name
      );

      setText("userName", name);
      setText("userEmail", email);
      setText("userPhone", phone);
      setText("userCountry", country);
      setText("userCurrency", currency);
      setText("userStatus", status.toUpperCase());

      // Wallet balance
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

      // Account approval status
      if (status === "approved") {
        setText(
          "accountStatus",
          translate("Account Approved")
        );

        showMessage(
          translate("Your account is active. Welcome to MYZEN MONEY."),
          "#16a34a"
        );

        document.querySelectorAll(".menu-item").forEach((item) => {
          item.style.pointerEvents = "auto";
          item.style.opacity = "1";
        });

      } else {
        setText(
          "accountStatus",
          translate("Waiting for Admin Approval")
        );

        showMessage(
          translate("Your account is pending. Please wait for Admin approval."),
          "#d97706"
        );

        document.querySelectorAll(".menu-item").forEach((item) => {
          item.style.pointerEvents = "none";
          item.style.opacity = "0.45";
        });
      }
    },

    (error) => {
      console.error("MYZEN Dashboard Error:", error);

      setText(
        "accountStatus",
        translate("Unable to load account")
      );

      showMessage(
        "Firebase Error: " + error.code,
        "#dc2626"
      );
    }
  );
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
      }

      await signOut(auth);

      window.location.href = "login.html";

    } catch (error) {
      alert(translate("Logout Error: ") + error.message);
    }
  });
}
