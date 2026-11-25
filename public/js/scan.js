
import { auth } from "./firebase.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

// ==========================================
// MYZEN MONEY SCAN & TRANSFER
// BACKEND API VERSION
// ==========================================

const API_BASE_URL = "https://myzen-money-js.onrender.com";

// ==========================================
// HTML ELEMENTS
// ==========================================

const accountCountryEl =
  document.getElementById("accountCountry");

const accountCurrencyEl =
  document.getElementById("accountCurrency");

const startScanBtn =
  document.getElementById("startScan");

const stopScanBtn =
  document.getElementById("stopScan");

const receiveCodeInput =
  document.getElementById("receiveCodeInput");

const lookupCodeBtn =
  document.getElementById("lookupCodeButton");

const scanMessage =
  document.getElementById("scanMessage");

const recipientInfo =
  document.getElementById("recipientInfo");

const recipientName =
  document.getElementById("recipientName");

const recipientCountry =
  document.getElementById("recipientCountry");

const recipientUid =
  document.getElementById("recipientUid");

const qrTransferForm =
  document.getElementById("qrTransferForm");

const qrAmount =
  document.getElementById("qrAmount");

const qrCurrency =
  document.getElementById("qrCurrency");

const qrNote =
  document.getElementById("qrNote");

const submitQrTransfer =
  document.getElementById("submitQrTransfer");

// ==========================================
// APPLICATION STATE
// ==========================================

let currentUser = null;
let currentProfile = null;
let currentRecipient = null;

let html5QrCode = null;

let isScanning = false;
let isSubmitting = false;
let isLookingUp = false;

// ==========================================
// COUNTRY & CURRENCY
// ==========================================

function normalizeCountry(value) {

  const country = String(value || "")
    .trim()
    .toLowerCase();

  if (
    country === "thailand" ||
    country === "th" ||
    country === "ไทย"
  ) {
    return "Thailand";
  }

  if (
    country === "myanmar" ||
    country === "mm" ||
    country === "burma" ||
    country === "မြန်မာ" ||
    country === "မြန်မာနိုင်ငံ"
  ) {
    return "Myanmar";
  }

  return "";
}

function getCurrency(country) {

  if (country === "Thailand") return "THB";

  if (country === "Myanmar") return "MMK";

  return "";
}

// ==========================================
// MESSAGE
// ==========================================

function showMessage(message, type = "info") {

  if (!scanMessage) return;

  scanMessage.textContent = message;

  scanMessage.style.display = "block";

  if (type === "error") {

    scanMessage.style.color = "#dc2626";

  } else if (type === "success") {

    scanMessage.style.color = "#16a34a";

  } else {

    scanMessage.style.color = "#2563eb";
  }
}

// ==========================================
// GPS VALIDATION
// ==========================================

function isGPSValid() {

  const location = window.MYZEN_LOCATION;

  if (!location || location.ready !== true) {
    return false;
  }

  const gpsCountry = normalizeCountry(
    location.country
  );

  const gpsCurrency = String(
    location.currency || ""
  ).toUpperCase();

  const accountCountry = normalizeCountry(
    currentProfile?.country
  );

  const expectedCurrency = getCurrency(
    accountCountry
  );

  return Boolean(
    gpsCountry &&
    gpsCurrency &&
    accountCountry &&
    gpsCountry === accountCountry &&
    gpsCurrency === expectedCurrency
  );
}

function checkGPS() {

  const location = window.MYZEN_LOCATION;

  if (!location || location.ready !== true) {

    showMessage(
      "GPS location is required. Please allow GPS access.",
      "error"
    );

    return false;
  }

  const gpsCountry = normalizeCountry(
    location.country
  );

  const gpsCurrency = String(
    location.currency || ""
  ).toUpperCase();

  const accountCountry = normalizeCountry(
    currentProfile?.country
  );

  const expectedCurrency = getCurrency(
    accountCountry
  );

  if (!gpsCountry || !gpsCurrency) {

    showMessage(
      "Unable to verify your GPS location.",
      "error"
    );

    return false;
  }

  if (
    gpsCountry !== accountCountry ||
    gpsCurrency !== expectedCurrency
  ) {

    showMessage(
      "Your GPS country does not match your wallet country.",
      "error"
    );

    return false;
  }

  return true;
}

// ==========================================
// AMOUNT VALIDATION
// ==========================================

function isValidTransferAmount() {

  const amount = Number(qrAmount?.value);

  const currency = String(
    qrCurrency?.value || ""
  ).toUpperCase();

  if (!Number.isFinite(amount) || amount <= 0) {
    return false;
  }

  if (currency === "MMK") {
    return Number.isInteger(amount);
  }

  if (currency === "THB") {
    return Number.isInteger(amount * 100);
  }

  return false;
}

// ==========================================
// UPDATE SUBMIT BUTTON
// ==========================================

function updateSubmitButton() {

  if (!submitQrTransfer) return;

  const canSubmit =
    Boolean(
      currentUser &&
      currentProfile &&
      currentRecipient &&
      !isSubmitting &&
      isGPSValid() &&
      isValidTransferAmount()
    );

  submitQrTransfer.disabled = !canSubmit;

  submitQrTransfer.textContent = isSubmitting
    ? "Submitting..."
    : "Submit Transfer Request";
}

// ==========================================
// FIREBASE AUTH TOKEN
// ==========================================

async function getAuthToken() {

  if (!currentUser) {
    throw new Error("Please log in first.");
  }

  return await currentUser.getIdToken();
}

// ==========================================
// BACKEND API REQUEST
// ==========================================

async function apiRequest(endpoint, options = {}) {

  const token = await getAuthToken();

  let response;

  try {

    response = await fetch(
      `${API_BASE_URL}${endpoint}`,
      {
        method: options.method || "POST",

        headers: {
          "Authorization": `Bearer ${token}`,

          ...(options.body !== undefined
            ? { "Content-Type": "application/json" }
            : {})
        },

        ...(options.body !== undefined
          ? { body: JSON.stringify(options.body) }
          : {})
      }
    );

  } catch (error) {

    throw new Error(
      "Unable to connect to MYZEN MONEY server. Please try again."
    );
  }

  let data;

  try {

    data = await response.json();

  } catch {

    throw new Error(
      "Backend returned an invalid response."
    );
  }

  if (!response.ok || data.success !== true) {

    throw new Error(
      data.message || "Backend request failed."
    );
  }

  return data;
}

// ==========================================
// LOAD PROFILE FROM BACKEND
// ==========================================

async function loadUserProfile(user) {

  try {

    const result = await apiRequest(
      "/api/me",
      {
        method: "GET"
      }
    );

    if (!result.profile) {
      throw new Error("Wallet profile not found.");
    }

    currentProfile = result.profile;

    if (
      String(currentProfile.status || "").toLowerCase()
      !== "approved"
    ) {

      throw new Error(
        "Your account is not approved."
      );
    }

    const country = normalizeCountry(
      currentProfile.country
    );

    const currency = getCurrency(country);

    if (!country || !currency) {

      throw new Error(
        "Unsupported wallet country."
      );
    }

    if (accountCountryEl) {
      accountCountryEl.textContent = country;
    }

    if (accountCurrencyEl) {
      accountCurrencyEl.textContent = currency;
    }

    if (qrCurrency) {
      qrCurrency.value = currency;
    }

    showMessage(
      "Wallet connected. Ready to scan or enter Receive Code.",
      "success"
    );

    updateSubmitButton();

    return true;

  } catch (error) {

    console.error(
      "PROFILE API ERROR:",
      error
    );

    currentProfile = null;

    updateSubmitButton();

    showMessage(
      error.message || "Unable to load wallet profile.",
      "error"
    );

    return false;
  }
}

// ==========================================
// RESET RECIPIENT
// ==========================================

function resetRecipient() {

  currentRecipient = null;

  if (recipientInfo) {
    recipientInfo.style.display = "none";
  }

  if (recipientName) {
    recipientName.textContent = "";
  }

  if (recipientCountry) {
    recipientCountry.textContent = "";
  }

  if (recipientUid) {
    recipientUid.value = "";
  }

  if (qrTransferForm) {
    qrTransferForm.style.display = "none";
  }

  updateSubmitButton();
}

// ==========================================
// NORMALIZE RECEIVE CODE
// ==========================================

function normalizeReceiveCode(value) {

  let code = String(value || "").trim();

  code = code.replace(
    /^MYZEN-MONEY:/i,
    ""
  );

  if (!/^\d{6}$/.test(code)) {
    return "";
  }

  return code;
}

// ==========================================
// LOOKUP RECIPIENT
// ==========================================

async function lookupRecipient(rawCode) {

  if (isLookingUp) return;

  if (!currentUser || !currentProfile) {

    showMessage(
      "Please log in first.",
      "error"
    );

    return;
  }

  if (!checkGPS()) return;

  const code = normalizeReceiveCode(rawCode);

  if (!code) {

    showMessage(
      "Please enter a valid 6-digit Receive Code.",
      "error"
    );

    return;
  }

  isLookingUp = true;

  if (lookupCodeBtn) {
    lookupCodeBtn.disabled = true;
  }

  resetRecipient();

  showMessage(
    "Searching recipient...",
    "info"
  );

  try {

    const result = await apiRequest(
      "/api/lookup",
      {
        method: "POST",
        body: {
          code
        }
      }
    );

    const recipient = result.recipient;

    if (!recipient || !recipient.uid) {

      throw new Error(
        "Recipient information is invalid."
      );
    }

    if (recipient.uid === currentUser.uid) {

      throw new Error(
        "You cannot transfer to yourself."
      );
    }

    const senderCountry = normalizeCountry(
      currentProfile.country
    );

    const targetCountry = normalizeCountry(
      recipient.country
    );

    if (
      !targetCountry ||
      targetCountry !== senderCountry
    ) {

      throw new Error(
        "Recipient country does not match your wallet."
      );
    }

    currentRecipient = {
      uid: recipient.uid,
      name: recipient.name,
      country: targetCountry,
      code
    };

    if (recipientName) {
      recipientName.textContent = recipient.name || "MYZEN MONEY User";
    }

    if (recipientCountry) {
      recipientCountry.textContent = targetCountry;
    }

    if (recipientUid) {
      recipientUid.value = recipient.uid;
    }

    if (recipientInfo) {
      recipientInfo.style.display = "block";
    }

    if (qrTransferForm) {
      qrTransferForm.style.display = "block";
    }

    if (qrCurrency) {
      qrCurrency.value = getCurrency(senderCountry);
    }

    updateSubmitButton();

    showMessage(
      "Recipient found successfully. Enter amount to continue.",
      "success"
    );

  } catch (error) {

    console.error(
      "LOOKUP ERROR:",
      error
    );

    resetRecipient();

    showMessage(
      error.message || "Recipient lookup failed.",
      "error"
    );

  } finally {

    isLookingUp = false;

    if (lookupCodeBtn) {
      lookupCodeBtn.disabled = false;
    }
  }
}

// ==========================================
// AMOUNT INPUT CHANGE
// ==========================================

if (qrAmount) {

  qrAmount.addEventListener(
    "input",
    updateSubmitButton
  );
}

// ==========================================
// MANUAL RECEIVE CODE
// ==========================================

if (lookupCodeBtn) {

  lookupCodeBtn.addEventListener(
    "click",
    async () => {

      await lookupRecipient(
        receiveCodeInput?.value || ""
      );

    }
  );
}

if (receiveCodeInput) {

  receiveCodeInput.addEventListener(
    "keydown",
    async (event) => {

      if (event.key === "Enter") {

        event.preventDefault();

        await lookupRecipient(
          receiveCodeInput.value
        );
      }
    }
  );
}

// ==========================================
// QR SCAN SUCCESS
// ==========================================

async function onScanSuccess(decodedText) {

  if (!isScanning) return;

  const code = normalizeReceiveCode(
    decodedText
  );

  if (!code) {

    showMessage(
      "Invalid MYZEN MONEY QR Code.",
      "error"
    );

    return;
  }

  if (receiveCodeInput) {
    receiveCodeInput.value = code;
  }

  await stopCamera();

  await lookupRecipient(code);
}

// ==========================================
// START CAMERA
// ==========================================

async function startCamera() {

  if (!currentUser || !currentProfile) {

    showMessage(
      "Please log in first.",
      "error"
    );

    return;
  }

  if (!checkGPS()) return;

  if (typeof Html5Qrcode === "undefined") {

    showMessage(
      "QR Scanner library not loaded.",
      "error"
    );

    return;
  }

  if (isScanning) return;

  try {

    html5QrCode = new Html5Qrcode("reader");

    showMessage(
      "Starting camera...",
      "info"
    );

    await html5QrCode.start(

      { facingMode: "environment" },

      {
        fps: 10,

        qrbox: {
          width: 250,
          height: 250
        }
      },

      onScanSuccess,

      () => {}

    );

    isScanning = true;

    if (startScanBtn) {
      startScanBtn.disabled = true;
    }

    if (stopScanBtn) {
      stopScanBtn.disabled = false;
    }

    showMessage(
      "Camera started. Scan a MYZEN MONEY QR Code.",
      "success"
    );

  } catch (error) {

    console.error(
      "CAMERA ERROR:",
      error
    );

    html5QrCode = null;

    isScanning = false;

    showMessage(
      "Unable to start camera. Allow camera access and use HTTPS or localhost.",
      "error"
    );
  }
}

// ==========================================
// STOP CAMERA
// ==========================================

async function stopCamera() {

  if (!html5QrCode) return;

  try {

    if (isScanning) {
      await html5QrCode.stop();
    }

    await html5QrCode.clear();

  } catch (error) {

    console.warn(
      "CAMERA STOP WARNING:",
      error
    );

  } finally {

    html5QrCode = null;

    isScanning = false;

    if (startScanBtn) {
      startScanBtn.disabled = false;
    }

    if (stopScanBtn) {
      stopScanBtn.disabled = true;
    }
  }
}

// ==========================================
// CAMERA BUTTONS
// ==========================================

if (startScanBtn) {
  startScanBtn.addEventListener(
    "click",
    startCamera
  );
}

if (stopScanBtn) {
  stopScanBtn.addEventListener(
    "click",
    stopCamera
  );
}

// ==========================================
// WALLET TRANSFER REQUEST
// ==========================================

if (qrTransferForm) {

  qrTransferForm.addEventListener(
    "submit",
    async (event) => {

      event.preventDefault();

      if (isSubmitting) return;

      if (!currentUser || !currentProfile) {

        showMessage(
          "Please log in first.",
          "error"
        );

        return;
      }

      if (
        String(currentProfile.status || "").toLowerCase()
        !== "approved"
      ) {

        showMessage(
          "Your account is not approved.",
          "error"
        );

        return;
      }

      if (!currentRecipient) {

        showMessage(
          "Please find a recipient first.",
          "error"
        );

        return;
      }

      if (!checkGPS()) {
        updateSubmitButton();
        return;
      }

      const amount = Number(
        qrAmount?.value
      );

      const currency = String(
        qrCurrency?.value || ""
      ).toUpperCase();

      const expectedCurrency = getCurrency(
        normalizeCountry(currentProfile.country)
      );

      if (
        !Number.isFinite(amount) ||
        amount <= 0
      ) {

        showMessage(
          "Please enter a valid amount.",
          "error"
        );

        updateSubmitButton();
        return;
      }

      if (currency !== expectedCurrency) {

        showMessage(
          "Currency does not match your wallet.",
          "error"
        );

        updateSubmitButton();
        return;
      }

      if (
        currency === "MMK" &&
        !Number.isInteger(amount)
      ) {

        showMessage(
          "MMK amount must be a whole number.",
          "error"
        );

        updateSubmitButton();
        return;
      }

      if (
        currency === "THB" &&
        !Number.isInteger(amount * 100)
      ) {

        showMessage(
          "THB supports up to 2 decimal places.",
          "error"
        );

        updateSubmitButton();
        return;
      }

      isSubmitting = true;

      updateSubmitButton();

      showMessage(
        "Submitting transfer request...",
        "info"
      );

      try {

        const transferId = crypto.randomUUID();

        const result = await apiRequest(
          "/api/transfer",
          {
            method: "POST",

            body: {
              code: currentRecipient.code,

              recipientUid: currentRecipient.uid,

              currency,

              amount,

              note: qrNote?.value || "",

              transferId
            }
          }
        );

        showMessage(
          result.message ||
          "Transfer request submitted successfully.",
          "success"
        );

        await loadUserProfile(currentUser);

        if (qrAmount) {
          qrAmount.value = "";
        }

        if (qrNote) {
          qrNote.value = "";
        }

        if (receiveCodeInput) {
          receiveCodeInput.value = "";
        }

        resetRecipient();

      } catch (error) {

        console.error(
          "MYZEN BACKEND TRANSFER ERROR:",
          error
        );

        showMessage(
          error.message || "Transfer request failed.",
          "error"
        );

      } finally {

        isSubmitting = false;

        updateSubmitButton();
      }
    }
  );
}

// ==========================================
// GPS LOCATION CHANGE
// ==========================================

window.addEventListener(
  "myzenlocationchange",
  () => {

    updateSubmitButton();

    if (currentProfile && checkGPS()) {

      showMessage(
        "GPS verified. You can scan or transfer.",
        "success"
      );
    }
  }
);

// ==========================================
// FIREBASE AUTH STATE
// ==========================================

onAuthStateChanged(auth, async (user) => {

  currentUser = user;

  currentProfile = null;

  currentRecipient = null;

  isSubmitting = false;

  updateSubmitButton();

  await stopCamera();

  resetRecipient();

  if (!user) {

    showMessage(
      "Please log in to use MYZEN MONEY Scan.",
      "error"
    );

    return;
  }

  const profileLoaded = await loadUserProfile(user);

  if (!profileLoaded) return;

  if (!window.MYZEN_LOCATION?.ready) {

    showMessage(
      "GPS location is required. Please allow GPS access.",
      "error"
    );

  } else {

    checkGPS();
  }

  updateSubmitButton();
});

// ==========================================
// INITIAL UI
// ==========================================

if (stopScanBtn) {
  stopScanBtn.disabled = true;
}

if (recipientInfo) {
  recipientInfo.style.display = "none";
}

if (qrTransferForm) {
  qrTransferForm.style.display = "none";
}

if (submitQrTransfer) {
  submitQrTransfer.disabled = true;
  submitQrTransfer.textContent = "Submit Transfer Request";
}

console.log(
  "MYZEN MONEY SCAN & TRANSFER VERSION LOADED"
);
