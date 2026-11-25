
import { auth, db } from "./firebase.js";

import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

import {
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

const accountName = document.getElementById("accountName");
const accountEmail = document.getElementById("accountEmail");
const walletId = document.getElementById("walletId");
const copyWalletBtn = document.getElementById("copyWalletBtn");
const receiveMessage = document.getElementById("receiveMessage");

let currentWalletId = "";

function message(text, color = "#dc2626") {
  receiveMessage.textContent = text;
  receiveMessage.style.color = color;
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.replace("login.html");
    return;
  }

  try {
    const userRef = doc(db, "users", user.uid);
    const snapshot = await getDoc(userRef);

    if (!snapshot.exists()) {
      message("Account profile not found.");
      return;
    }

    const profile = snapshot.data();

    if (profile.status !== "approved") {
      await signOut(auth);
      window.location.replace("pending.html");
      return;
    }

    currentWalletId = user.uid;

    accountName.textContent = profile.name || "MYZEN MONEY User";
    accountEmail.textContent = user.email || "No email";
    walletId.textContent = currentWalletId;

    // Generate QR Code containing Wallet ID
    const qrContainer = document.getElementById("qrcode");
    qrContainer.innerHTML = "";

    new QRCode(qrContainer, {
      text: currentWalletId,
      width: 190,
      height: 190,
      correctLevel: QRCode.CorrectLevel.H
    });

  } catch (error) {
    console.error(error);
    message("Unable to load receive information: " + error.message);
  }
});

// Copy Wallet ID
copyWalletBtn.addEventListener("click", async () => {
  if (!currentWalletId) {
    message("Wallet ID is not available.");
    return;
  }

  try {
    await navigator.clipboard.writeText(currentWalletId);
    message("Wallet ID copied successfully!", "#15803d");
  } catch (error) {
    message("Unable to copy Wallet ID. Please copy it manually.");
  }
});
