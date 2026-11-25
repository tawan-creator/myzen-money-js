
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";

import {
  getAuth,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

import {
  getFirestore
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

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

const app = initializeApp(firebaseConfig);

const auth = getAuth(app);
const db = getFirestore(app);

export { app, auth, db, onAuthStateChanged };
