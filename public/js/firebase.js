
import {
  initializeApp,
  getApps,
  getApp
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";

import {
  initializeAuth,
  browserSessionPersistence,
  onAuthStateChanged,
  getAuth
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

import {
  getFirestore
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

// ==========================================
// MYZEN MONEY - FIREBASE CONFIGURATION
// ==========================================

const firebaseConfig = {
  apiKey: "AIzaSyBhy1tSWb_W-xI11w9l7DD5zPPVjKUttsE",
  authDomain: "myzen-money.firebaseapp.com",
  databaseURL: "https://myzen-money-default-rtdb.firebaseio.com",
  projectId: "myzen-money",
  storageBucket: "myzen-money.firebasestorage.app",
  messagingSenderId: "1038004956760",
  appId: "1:1038004956760:web:2d8a3503609f22373f242d",
  measurementId: "G-Q7ZFPJMKD2"
};

const API_BASE_URL =
  "https://myzen-money-js.onrender.com";

// ==========================================
// FIREBASE APP
// ==========================================

const app = getApps().length
  ? getApp()
  : initializeApp(firebaseConfig);

// ==========================================
// FIREBASE AUTH
// ==========================================

let auth;

try {
  auth = initializeAuth(app, {
    persistence: browserSessionPersistence
  });
} catch (error) {
  if (error.code === "auth/already-initialized") {
    auth = getAuth(app);
  } else {
    throw error;
  }
}

// ==========================================
// FIRESTORE
// ==========================================

const db = getFirestore(app);

// ==========================================
// MYZEN MONEY - USER PRESENCE
// Heartbeat every 30 seconds
// ==========================================

let heartbeatTimer = null;
let heartbeatBusy = false;
let currentPresenceUser = null;

async function sendPresenceHeartbeat(user) {
  if (!user || heartbeatBusy) return;

  if (
    typeof document !== "undefined" &&
    document.visibilityState === "hidden"
  ) {
    return;
  }

  heartbeatBusy = true;

  try {
    const token = await user.getIdToken();

    const response = await fetch(
      `${API_BASE_URL}/api/presence/heartbeat`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      }
    );

    if (!response.ok) {
      console.warn(
        "MYZEN PRESENCE ERROR:",
        response.status
      );
    }

  } catch (error) {
    console.warn(
      "MYZEN PRESENCE HEARTBEAT FAILED:",
      error.message
    );

  } finally {
    heartbeatBusy = false;
  }
}

function stopPresenceHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }

  currentPresenceUser = null;
}

// ==========================================
// AUTH STATE LISTENER
// ==========================================

onAuthStateChanged(auth, (user) => {
  stopPresenceHeartbeat();

  if (!user) return;

  currentPresenceUser = user;

  // First heartbeat
  sendPresenceHeartbeat(user);

  // Repeat every 30 seconds
  heartbeatTimer = setInterval(() => {
    if (currentPresenceUser) {
      sendPresenceHeartbeat(currentPresenceUser);
    }
  }, 30000);
});

// ==========================================
// PAGE VISIBILITY
// ==========================================

if (typeof document !== "undefined") {
  document.addEventListener(
    "visibilitychange",
    () => {
      if (
        document.visibilityState === "visible" &&
        currentPresenceUser
      ) {
        sendPresenceHeartbeat(currentPresenceUser);
      }
    }
  );
}

// ==========================================
// EXPORT
// ==========================================

export {
  app,
  auth,
  db,
  onAuthStateChanged
};
