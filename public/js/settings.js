
"use strict";

import { auth } from "./firebase.js";

import {
  onAuthStateChanged,
  sendPasswordResetEmail,
  signOut
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

const $ = (id) => document.getElementById(id);

const els = {
  pageTitle: $("pageTitle"),
  accountTitle: $("accountTitle"),
  profileLabel: $("profileLabel"),
  profileDescription: $("profileDescription"),
  profileBtn: $("profileBtn"),
  emailLabel: $("emailLabel"),
  userEmail: $("userEmail"),
  securityTitle: $("securityTitle"),
  passwordLabel: $("passwordLabel"),
  passwordDescription: $("passwordDescription"),
  resetPasswordBtn: $("resetPasswordBtn"),
  preferenceTitle: $("preferenceTitle"),
  languageLabel: $("languageLabel"),
  languageDescription: $("languageDescription"),
  languageSelect: $("languageSelect"),
  themeLabel: $("themeLabel"),
  themeDescription: $("themeDescription"),
  themeSelect: $("themeSelect"),
  depositSlipLabel: $("depositSlipLabel"),
  depositSlipDescription: $("depositSlipDescription"),
  depositSlipStatus: $("depositSlipStatus"),
  depositSlipToggle: $("depositSlipToggle"),
  depositHistoryBtn: $("depositHistoryBtn"),
  saveSettingsBtn: $("saveSettingsBtn"),
  settingsMessage: $("settingsMessage"),
  dashboardBtn: $("dashboardBtn"),
  logoutBtn: $("logoutBtn")
};

const SETTINGS_KEY = "myzen_settings";

let currentUser = null;

const translations = {
  en: {
    pageTitle: "Settings",
    accountTitle: "ACCOUNT",
    profileLabel: "Account Information",
    profileDescription: "View your personal information and wallet details.",
    profileBtn: "View Profile",
    emailLabel: "Login Email",
    securityTitle: "SECURITY",
    passwordLabel: "Change Password",
    passwordDescription: "Receive a password reset link through your email.",
    resetPasswordBtn: "Send Password Reset Email",
    preferenceTitle: "PREFERENCES",
    languageLabel: "Language",
    languageDescription: "Select your preferred language.",
    themeLabel: "Appearance",
    themeDescription: "Choose Light Mode or Dark Mode.",
    lightMode: "Light Mode",
    darkMode: "Dark Mode",
    depositSlipLabel: "Deposit Slip Display",
    depositSlipDescription: "Allow deposit slip images to be displayed in your deposit history.",
    depositSlipEnabled: "Enabled",
    depositSlipDisabled: "Disabled",
    depositHistoryBtn: "View Deposit History",
    saveSettingsBtn: "Save Settings",
    dashboardBtn: "Back to Dashboard",
    logoutBtn: "Logout",
    loading: "Loading...",
    resetSending: "Sending...",
    resetSuccess: "Password reset email sent successfully. Please check your inbox.",
    resetError: "Unable to send password reset email.",
    loginRequired: "Please login first.",
    logoutConfirm: "Are you sure you want to logout?",
    logoutError: "Unable to logout. Please try again.",
    languageSaved: "Language preference saved.",
    settingsSaved: "Settings saved successfully.",
    settingsError: "Unable to save settings.",
    saveInProgress: "Saving..."
  },

  my: {
    pageTitle: "ဆက်တင်များ",
    accountTitle: "အကောင့်",
    profileLabel: "အကောင့်အချက်အလက်",
    profileDescription: "ကိုယ်ရေးအချက်အလက်နှင့် Wallet အသေးစိတ်ကို ကြည့်ရန်။",
    profileBtn: "Profile ကြည့်ရန်",
    emailLabel: "Login Email",
    securityTitle: "လုံခြုံရေး",
    passwordLabel: "Password ပြောင်းရန်",
    passwordDescription: "Password အသစ်သတ်မှတ်ရန် Email မှတစ်ဆင့် Link ပို့ပေးပါမည်။",
    resetPasswordBtn: "Password Reset Email ပို့ရန်",
    preferenceTitle: "စိတ်ကြိုက်ဆက်တင်များ",
    languageLabel: "ဘာသာစကား",
    languageDescription: "နှစ်သက်ရာ ဘာသာစကားကို ရွေးချယ်ပါ။",
    themeLabel: "အသွင်အပြင်",
    themeDescription: "Light Mode သို့မဟုတ် Dark Mode ကို ရွေးချယ်ပါ။",
    lightMode: "အလင်းရောင်",
    darkMode: "အမှောင်ရောင်",
    depositSlipLabel: "Deposit Slip ပြသမှု",
    depositSlipDescription: "Deposit History ထဲတွင် Deposit Slip ပုံများကို ပြသခွင့်ပြုရန်။",
    depositSlipEnabled: "ဖွင့်ထားသည်",
    depositSlipDisabled: "ပိတ်ထားသည်",
    depositHistoryBtn: "Deposit History ကြည့်ရန်",
    saveSettingsBtn: "ဆက်တင်များ သိမ်းဆည်းရန်",
    dashboardBtn: "Dashboard သို့ ပြန်သွားရန်",
    logoutBtn: "အကောင့်ထွက်ရန်",
    loading: "ဖွင့်နေသည်...",
    resetSending: "ပို့နေသည်...",
    resetSuccess: "Password Reset Email ပို့ပြီးပါပြီ။ Email ကို စစ်ဆေးပါ။",
    resetError: "Password Reset Email ပို့၍ မရပါ။",
    loginRequired: "အရင် Login ဝင်ပေးပါ။",
    logoutConfirm: "အကောင့်ထွက်မှာ သေချာပါသလား။",
    logoutError: "Logout လုပ်၍ မရပါ။ ထပ်ကြိုးစားပါ။",
    languageSaved: "ဘာသာစကား ရွေးချယ်မှု သိမ်းဆည်းပြီးပါပြီ။",
    settingsSaved: "ဆက်တင်များ သိမ်းဆည်းပြီးပါပြီ။",
    settingsError: "ဆက်တင်များ သိမ်းဆည်း၍ မရပါ။",
    saveInProgress: "သိမ်းဆည်းနေသည်..."
  },

  th: {
    pageTitle: "การตั้งค่า",
    accountTitle: "บัญชี",
    profileLabel: "ข้อมูลบัญชี",
    profileDescription: "ดูข้อมูลส่วนตัวและรายละเอียดกระเป๋าเงิน",
    profileBtn: "ดูโปรไฟล์",
    emailLabel: "อีเมลเข้าสู่ระบบ",
    securityTitle: "ความปลอดภัย",
    passwordLabel: "เปลี่ยนรหัสผ่าน",
    passwordDescription: "รับลิงก์รีเซ็ตรหัสผ่านทางอีเมล",
    resetPasswordBtn: "ส่งอีเมลรีเซ็ตรหัสผ่าน",
    preferenceTitle: "การตั้งค่าทั่วไป",
    languageLabel: "ภาษา",
    languageDescription: "เลือกภาษาที่คุณต้องการ",
    themeLabel: "รูปแบบหน้าจอ",
    themeDescription: "เลือกระหว่างโหมดสว่างหรือโหมดมืด",
    lightMode: "โหมดสว่าง",
    darkMode: "โหมดมืด",
    depositSlipLabel: "การแสดงสลิปฝากเงิน",
    depositSlipDescription: "อนุญาตให้แสดงรูปสลิปในประวัติการฝากเงิน",
    depositSlipEnabled: "เปิดใช้งาน",
    depositSlipDisabled: "ปิดใช้งาน",
    depositHistoryBtn: "ดูประวัติการฝากเงิน",
    saveSettingsBtn: "บันทึกการตั้งค่า",
    dashboardBtn: "กลับไปหน้าหลัก",
    logoutBtn: "ออกจากระบบ",
    loading: "กำลังโหลด...",
    resetSending: "กำลังส่ง...",
    resetSuccess: "ส่งอีเมลรีเซ็ตรหัสผ่านแล้ว กรุณาตรวจสอบอีเมล",
    resetError: "ไม่สามารถส่งอีเมลรีเซ็ตรหัสผ่านได้",
    loginRequired: "กรุณาเข้าสู่ระบบก่อน",
    logoutConfirm: "คุณแน่ใจหรือไม่ว่าต้องการออกจากระบบ?",
    logoutError: "ไม่สามารถออกจากระบบได้ กรุณาลองอีกครั้ง",
    languageSaved: "บันทึกการตั้งค่าภาษาแล้ว",
    settingsSaved: "บันทึกการตั้งค่าเรียบร้อยแล้ว",
    settingsError: "ไม่สามารถบันทึกการตั้งค่าได้",
    saveInProgress: "กำลังบันทึก..."
  }
};

function loadSettings() {
  try {
    const saved = JSON.parse(
      localStorage.getItem(SETTINGS_KEY) || "{}"
    );

    return {
      theme: saved.theme === "dark" ? "dark" : "light",
      showDepositSlips: saved.showDepositSlips !== false
    };
  } catch (error) {
    console.error("SETTINGS LOAD ERROR:", error);

    return {
      theme: "light",
      showDepositSlips: true
    };
  }
}

let savedSettings = loadSettings();

let currentLanguage =
  localStorage.getItem("myzen_language") || "en";

if (!translations[currentLanguage]) {
  currentLanguage = "en";
}

function t(key) {
  return translations[currentLanguage][key] ||
    translations.en[key] ||
    key;
}

function showMessage(message, type = "error") {
  els.settingsMessage.textContent = message;
  els.settingsMessage.className = "message " + type;
}

function applyTheme(theme) {
  const validTheme = theme === "dark" ? "dark" : "light";

  document.documentElement.dataset.theme = validTheme;

  const themeColor = validTheme === "dark"
    ? "#101828"
    : "#155eef";

  document.querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", themeColor);
}

function applyLanguage() {
  document.documentElement.lang = currentLanguage;

  const keys = [
    "pageTitle",
    "accountTitle",
    "profileLabel",
    "profileDescription",
    "profileBtn",
    "emailLabel",
    "securityTitle",
    "passwordLabel",
    "passwordDescription",
    "resetPasswordBtn",
    "preferenceTitle",
    "languageLabel",
    "languageDescription",
    "themeLabel",
    "themeDescription",
    "depositSlipLabel",
    "depositSlipDescription",
    "depositHistoryBtn",
    "saveSettingsBtn",
    "dashboardBtn",
    "logoutBtn"
  ];

  keys.forEach((key) => {
    if (els[key]) {
      els[key].textContent = t(key);
    }
  });

  els.languageSelect.value = currentLanguage;

  els.themeSelect.options[0].textContent = t("lightMode");
  els.themeSelect.options[1].textContent = t("darkMode");

  updateDepositSlipStatus();
}

function updateDepositSlipStatus() {
  els.depositSlipStatus.textContent =
    els.depositSlipToggle.checked
      ? t("depositSlipEnabled")
      : t("depositSlipDisabled");
}

function goToProfile() {
  window.location.href = "profile.html";
}

function goToDashboard() {
  window.location.href = "dashboard.html";
}

function goToDepositHistory() {
  window.location.href = "history.html";
}

async function resetPassword() {
  if (!currentUser || !currentUser.email) {
    showMessage(t("loginRequired"));
    return;
  }

  els.resetPasswordBtn.disabled = true;
  els.resetPasswordBtn.textContent = t("resetSending");

  try {
    await sendPasswordResetEmail(auth, currentUser.email);

    showMessage(t("resetSuccess"), "success");

  } catch (error) {
    console.error("PASSWORD RESET ERROR:", error);

    showMessage(
      t("resetError") + " " + (error.message || ""),
      "error"
    );

  } finally {
    els.resetPasswordBtn.disabled = false;
    els.resetPasswordBtn.textContent = t("resetPasswordBtn");
  }
}

function changeLanguage() {
  currentLanguage = els.languageSelect.value;

  localStorage.setItem("myzen_language", currentLanguage);

  applyLanguage();

  showMessage(t("languageSaved"), "success");
}

function changeTheme() {
  const theme = els.themeSelect.value === "dark"
    ? "dark"
    : "light";

  savedSettings.theme = theme;
  applyTheme(theme);

  // Persist immediately so every page (including Quick Actions and Money Services)
  // switches to the selected theme when the user navigates away from Settings.
  try {
    const current = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    const updated = { ...current, theme };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
    localStorage.setItem("myzen_theme", theme);
  } catch (error) {
    console.error("THEME SAVE ERROR:", error);
    showMessage(t("settingsError"), "error");
  }
}

function saveSettings() {
  const theme = els.themeSelect.value === "dark"
    ? "dark"
    : "light";

  const settings = {
    theme,
    showDepositSlips: els.depositSlipToggle.checked
  };

  try {
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify(settings)
    );

    // Keep theme available to pages using the simple theme key too.
    localStorage.setItem("myzen_theme", theme);

    savedSettings = settings;

    applyTheme(theme);

    showMessage(t("settingsSaved"), "success");

  } catch (error) {
    console.error("SETTINGS SAVE ERROR:", error);
    showMessage(t("settingsError"), "error");
  }
}

async function logout() {
  if (!confirm(t("logoutConfirm"))) {
    return;
  }

  els.logoutBtn.disabled = true;

  try {
    await signOut(auth);
    window.location.href = "login.html";

  } catch (error) {
    console.error("LOGOUT ERROR:", error);

    showMessage(t("logoutError"));

    els.logoutBtn.disabled = false;
  }
}

// Events
els.profileBtn.addEventListener("click", goToProfile);
els.dashboardBtn.addEventListener("click", goToDashboard);
els.depositHistoryBtn.addEventListener("click", goToDepositHistory);
els.resetPasswordBtn.addEventListener("click", resetPassword);
els.logoutBtn.addEventListener("click", logout);
els.languageSelect.addEventListener("change", changeLanguage);

els.themeSelect.addEventListener("change", changeTheme);

els.depositSlipToggle.addEventListener("change", () => {
  updateDepositSlipStatus();
});

els.saveSettingsBtn.addEventListener("click", saveSettings);

// Initial settings
els.themeSelect.value = savedSettings.theme;
els.depositSlipToggle.checked = savedSettings.showDepositSlips;

applyTheme(savedSettings.theme);
applyLanguage();

// Authentication
onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  currentUser = user;
  els.userEmail.textContent = user.email || "-";
});
