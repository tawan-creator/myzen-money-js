
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

// Initialize Firebase only once
const app = getApps().length
  ? getApp()
  : initializeApp(firebaseConfig);

// Initialize Authentication
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

// Initialize Firestore
const db = getFirestore(app);

export {
  app,
  auth,
  db,
  onAuthStateChanged
};
