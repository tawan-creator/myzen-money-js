
import { auth, db } from "./firebase.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

import {
  doc,
  getDoc,
  runTransaction,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

const countryEl = document.getElementById("country");
const currencyEl = document.getElementById("currency");
const receiveCodeEl = document.getElementById("receiveCode");
const receiveQrEl = document.getElementById("receiveQr");

const copyCodeBtn = document.getElementById("copyReceiveCode");
const downloadQrBtn = document.getElementById("downloadReceiveQr");

const receiveCodeMessage =
  document.getElementById("receiveCodeMessage");

const messageEl = document.getElementById("message");

let currentReceiveCode = "";
let qrLibraryPromise = null;


// SHOW MESSAGE
function showReceiveCodeMessage(text, success = false) {
  if (receiveCodeMessage) {
    receiveCodeMessage.textContent = text;
    receiveCodeMessage.style.color =
      success ? "#c7a24b" : "#b7ad98";
  } else {
    console.warn("HTML element #receiveCodeMessage not found:", text);
  }
}


// COUNTRY
function normalizeCountry(value) {
  const country = String(value || "").trim().toLowerCase();

  if (["thailand", "th", "ไทย"].includes(country)) {
    return "Thailand";
  }

  if (["myanmar", "mm", "burma", "မြန်မာ", "မြန်မာနိုင်ငံ"].includes(country)) {
    return "Myanmar";
  }

  return "";
}


// RANDOM 6 DIGIT CODE
function createRandomCode() {
  const random = new Uint32Array(1);
  crypto.getRandomValues(random);

  return String(100000 + (random[0] % 900000));
}


// LOAD QR LIBRARY
async function loadQRCodeLibrary() {
  if (window.QRCode) return;

  if (qrLibraryPromise) {
    return qrLibraryPromise;
  }

  qrLibraryPromise = (async () => {
    const urls = [
      "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js",
      "https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js"
    ];

    for (const url of urls) {
      try {
        await new Promise((resolve, reject) => {
          const script = document.createElement("script");

          script.src = url;
          script.async = true;

          script.onload = () => {
            if (window.QRCode) {
              resolve();
            } else {
              reject(new Error("QRCode library not found."));
            }
          };

          script.onerror = () => {
            script.remove();
            reject(new Error("Could not load QR library."));
          };

          document.head.appendChild(script);
        });

        if (window.QRCode) return;
      } catch (error) {
        console.warn("QR library failed:", url, error);
      }
    }

    throw new Error("QR Code library could not load. Check internet connection.");
  })();

  try {
    await qrLibraryPromise;
  } finally {
    if (!window.QRCode) {
      qrLibraryPromise = null;
    }
  }
}


// CREATE OR GET RECEIVE CODE
async function getOrCreateReceiveCode(user, profile) {
  const privateRef = doc(
    db,
    "walletReceiveCodes",
    user.uid
  );

  const privateSnap = await getDoc(privateRef);

  if (privateSnap.exists()) {
    const existingCode = String(
      privateSnap.data().code || ""
    );

    if (!/^\d{6}$/.test(existingCode)) {
      throw new Error("Your saved Receive Code is invalid.");
    }

    const publicRef = doc(
      db,
      "receiveCodes",
      existingCode
    );

    const publicSnap = await getDoc(publicRef);

    if (
      !publicSnap.exists() ||
      publicSnap.data().uid !== user.uid
    ) {
      throw new Error(
        "Receive Code record is incomplete. Please contact support."
      );
    }

    return existingCode;
  }

  for (let attempt = 0; attempt < 20; attempt++) {
    const code = createRandomCode();

    const publicRef = doc(
      db,
      "receiveCodes",
      code
    );

    const result = await runTransaction(
      db,
      async (transaction) => {

        const existingPrivate =
          await transaction.get(privateRef);

        if (existingPrivate.exists()) {
          return String(
            existingPrivate.data().code || ""
          );
        }

        const existingPublic =
          await transaction.get(publicRef);

        if (existingPublic.exists()) {
          return null;
        }

        transaction.set(privateRef, {
          uid: user.uid,
          code: code,
          createdAt: serverTimestamp()
        });

        transaction.set(publicRef, {
          uid: user.uid,
          name: profile.name || "MYZEN MONEY User",
          country: normalizeCountry(profile.country),
          createdAt: serverTimestamp()
        });

        return code;
      }
    );

    if (result && /^\d{6}$/.test(result)) {
      return result;
    }
  }

  throw new Error(
    "Unable to create a unique code. Please try again."
  );
}


// GENERATE QR
async function generateReceiveQR(code) {
  if (!receiveQrEl) {
    throw new Error(
      "HTML element #receiveQr was not found."
    );
  }

  await loadQRCodeLibrary();

  receiveQrEl.innerHTML = "";

  new window.QRCode(receiveQrEl, {
    text: "MYZEN-MONEY:" + code,
    width: 220,
    height: 220,

    // Dark modules for reliable QR scanning
    colorDark: "#111111",

    // Soft warm background to reduce glare
    colorLight: "#f5efdf",

    correctLevel: window.QRCode.CorrectLevel.H
  });
}


// DOWNLOAD QR
function downloadQR() {
  if (!receiveQrEl) {
    showReceiveCodeMessage("QR area not found.");
    return;
  }

  const canvas = receiveQrEl.querySelector("canvas");
  const image = receiveQrEl.querySelector("img");

  let url = "";

  if (canvas) {
    url = canvas.toDataURL("image/png");
  } else if (image && image.src) {
    url = image.src;
  }

  if (!url) {
    showReceiveCodeMessage("QR Code is not ready.");
    return;
  }

  const link = document.createElement("a");

  link.href = url;
  link.download = "MYZEN-MONEY-Receive-QR.png";

  document.body.appendChild(link);
  link.click();
  link.remove();

  showReceiveCodeMessage(
    "QR Code download started.",
    true
  );
}


// DOWNLOAD BUTTON
if (downloadQrBtn) {
  downloadQrBtn.addEventListener("click", downloadQR);
} else {
  console.error("HTML element #downloadReceiveQr not found.");
}


// COPY BUTTON
if (copyCodeBtn) {
  copyCodeBtn.addEventListener("click", async () => {
    if (!currentReceiveCode) return;

    try {
      await navigator.clipboard.writeText(
        currentReceiveCode
      );

      showReceiveCodeMessage(
        "Receive Code copied successfully.",
        true
      );

    } catch (error) {
      console.error("Copy error:", error);

      showReceiveCodeMessage(
        "Unable to copy. Please copy manually."
      );
    }
  });
} else {
  console.error("HTML element #copyReceiveCode not found.");
}


// LOAD RECEIVE CODE
async function loadReceiveCode(user, profile) {
  showReceiveCodeMessage(
    "Creating your Receive Code..."
  );

  const code = await getOrCreateReceiveCode(
    user,
    profile
  );

  currentReceiveCode = code;

  if (receiveCodeEl) {
    receiveCodeEl.textContent = code;
  }

  if (copyCodeBtn) {
    copyCodeBtn.disabled = false;
  }

  try {
    await generateReceiveQR(code);

    if (downloadQrBtn) {
      downloadQrBtn.disabled = false;
    }

    showReceiveCodeMessage(
      "Your QR Code and Receive Code are ready.",
      true
    );

  } catch (error) {
    console.error("QR generation error:", error);

    if (downloadQrBtn) {
      downloadQrBtn.disabled = true;
    }

    showReceiveCodeMessage(
      "Receive Code is ready, but QR could not load. " +
      error.message
    );
  }
}


// AUTH CHECK
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  try {
    showReceiveCodeMessage("Loading your wallet...");

    const profileRef = doc(
      db,
      "users",
      user.uid
    );

    const profileSnap = await getDoc(profileRef);

    if (!profileSnap.exists()) {
      throw new Error("User profile not found.");
    }

    const profile = profileSnap.data();

    if (profile.status !== "approved") {
      throw new Error(
        "Your account is not approved yet."
      );
    }

    const country = normalizeCountry(
      profile.country
    );

    if (!country) {
      throw new Error(
        "Unsupported registered country."
      );
    }

    if (countryEl) {
      countryEl.textContent =
        country === "Thailand"
          ? "🇹🇭 Thailand"
          : "🇲🇲 Myanmar";
    }

    if (currencyEl) {
      currencyEl.textContent =
        "Currency: " +
        (country === "Thailand" ? "THB" : "MMK");
    }

    await loadReceiveCode(user, profile);

  } catch (error) {
    console.error("Receive Page Error:", error);

    if (receiveCodeEl) {
      receiveCodeEl.textContent = "------";
    }

    if (copyCodeBtn) {
      copyCodeBtn.disabled = true;
    }

    if (downloadQrBtn) {
      downloadQrBtn.disabled = true;
    }

    showReceiveCodeMessage(
      error.message || "Unable to load Receive Code."
    );

    if (messageEl) {
      messageEl.textContent =
        error.message || "Unable to load wallet.";

      messageEl.style.color = "#dc4545";
    }
  }
});
