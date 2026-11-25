
"use strict";

// ==========================================
// MYZEN MONEY BACKEND SERVER
// Firebase Admin SDK v14
// DEMO WALLET TRANSFER API
// ==========================================

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");

// ==========================================
// FIREBASE ADMIN SDK v14 IMPORTS
// ==========================================

const {
  initializeApp,
  cert,
  applicationDefault,
  getApps
} = require("firebase-admin/app");

const {
  getFirestore,
  FieldValue
} = require("firebase-admin/firestore");

const {
  getAuth
} = require("firebase-admin/auth");

// ==========================================
// EXPRESS CONFIGURATION
// ==========================================

const app = express();

const PORT = Number(process.env.PORT) || 3000;

const DEMO_MODE =
  String(process.env.DEMO_MODE).toLowerCase() === "true";

app.disable("x-powered-by");

app.use(express.json({
  limit: "100kb"
}));

// ==========================================
// CORS CONFIGURATION
// ==========================================

const allowedOrigins = (
  process.env.FRONTEND_ORIGINS ||
  "https://myzenmoney.app,https://www.myzenmoney.app,http://localhost:5500,http://127.0.0.1:5500"
)
  .split(",")
  .map(origin => origin.trim())
  .filter(Boolean);

app.use(cors({

  origin: function (origin, callback) {

    // Allow requests without Origin, such as local health checks.
    if (!origin) {
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    console.warn("CORS BLOCKED:", origin);

    return callback(
      new Error("Origin not allowed by MYZEN MONEY CORS.")
    );
  },

  methods: [
    "GET",
    "POST",
    "OPTIONS"
  ],

  allowedHeaders: [
    "Content-Type",
    "Authorization"
  ],

  credentials: true

}));

// ==========================================
// FIREBASE ADMIN INITIALIZATION
// ==========================================

let firebaseCredential;

try {

  if (process.env.FIREBASE_SERVICE_ACCOUNT) {

    const serviceAccount = JSON.parse(
      process.env.FIREBASE_SERVICE_ACCOUNT
    );

    if (serviceAccount.private_key) {

      serviceAccount.private_key =
        serviceAccount.private_key.replace(/\\n/g, "\n");

    }

    firebaseCredential = cert(serviceAccount);

  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {

    firebaseCredential = applicationDefault();

  } else {

    const serviceAccountPath = path.join(
      __dirname,
      "serviceAccountKey.json"
    );

    const serviceAccount = require(
      serviceAccountPath
    );

    firebaseCredential = cert(serviceAccount);

  }

  if (getApps().length === 0) {

    initializeApp({
      credential: firebaseCredential
    });

  }

  console.log("MYZEN FIREBASE ADMIN CONNECTED");

} catch (error) {

  console.error(
    "FIREBASE ADMIN INITIALIZATION ERROR:",
    error
  );

  process.exit(1);

}

// ==========================================
// FIRESTORE & AUTH
// ==========================================

const db = getFirestore();

const firebaseAuth = getAuth();

// ==========================================
// RESPONSE HELPERS
// ==========================================

function sendError(res, status, message) {

  return res.status(status).json({

    success: false,

    message

  });

}

// ==========================================
// COUNTRY NORMALIZATION
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

// ==========================================
// COUNTRY CURRENCY
// ==========================================

function getCurrency(country) {

  if (country === "Thailand") {
    return "THB";
  }

  if (country === "Myanmar") {
    return "MMK";
  }

  return "";

}

// ==========================================
// AMOUNT VALIDATION
// ==========================================

function validAmount(amount, currency) {

  if (
    typeof amount !== "number" ||
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
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
// AUTHENTICATION MIDDLEWARE
// ==========================================

async function requireAuth(req, res, next) {

  try {

    const authorization =
      req.headers.authorization || "";

    const match = authorization.match(
      /^Bearer\s+(.+)$/i
    );

    if (!match) {

      return sendError(
        res,
        401,
        "Authentication token is required."
      );

    }

    const decodedToken =
      await firebaseAuth.verifyIdToken(match[1]);

    req.user = {

      uid: decodedToken.uid,

      email: decodedToken.email || ""

    };

    next();

  } catch (error) {

    console.error(
      "AUTHENTICATION ERROR:",
      error.message
    );

    return sendError(
      res,
      401,
      "Invalid or expired login session. Please log in again."
    );

  }

}

// ==========================================
// HEALTH CHECK
// ==========================================

app.get("/api/health", (req, res) => {

  return res.json({

    success: true,

    message: "MYZEN MONEY BACKEND IS RUNNING",

    demoMode: DEMO_MODE,

    timestamp: new Date().toISOString()

  });

});

// ==========================================
// MY WALLET PROFILE
// GET /api/me
// ==========================================

app.get(
  "/api/me",
  requireAuth,
  async (req, res) => {

    try {

      const userRef = db
        .collection("users")
        .doc(req.user.uid);

      const userSnap = await userRef.get();

      if (!userSnap.exists) {

        return sendError(
          res,
          404,
          "Wallet profile not found."
        );

      }

      const profile = userSnap.data();

      if (profile.status !== "approved") {

        return sendError(
          res,
          403,
          "Your account is not approved."
        );

      }

      const country = normalizeCountry(
        profile.country
      );

      if (!country) {

        return sendError(
          res,
          400,
          "Unsupported wallet country."
        );

      }

      return res.json({

        success: true,

        profile: {

          uid: req.user.uid,

          name: profile.name || "",

          country,

          currency: getCurrency(country),

          balance: Number(profile.balance || 0),

          status: profile.status

        }

      });

    } catch (error) {

      console.error(
        "PROFILE API ERROR:",
        error
      );

      return sendError(
        res,
        500,
        "Unable to load wallet profile."
      );

    }

  }
);

// ==========================================
// RECEIVE CODE LOOKUP
// POST /api/lookup
// ==========================================

app.post(
  "/api/lookup",
  requireAuth,
  async (req, res) => {

    try {

      const code = String(
        req.body.code || ""
      ).trim();

      if (!/^\d{6}$/.test(code)) {

        return sendError(
          res,
          400,
          "Receive Code must contain exactly 6 digits."
        );

      }

      // Sender profile

      const senderRef = db
        .collection("users")
        .doc(req.user.uid);

      const senderSnap = await senderRef.get();

      if (!senderSnap.exists) {

        return sendError(
          res,
          404,
          "Your wallet profile was not found."
        );

      }

      const sender = senderSnap.data();

      if (sender.status !== "approved") {

        return sendError(
          res,
          403,
          "Your wallet is not approved."
        );

      }

      const senderCountry = normalizeCountry(
        sender.country
      );

      if (!senderCountry) {

        return sendError(
          res,
          400,
          "Your wallet country is invalid."
        );

      }

      // Receive code document

      const codeRef = db
        .collection("receiveCodes")
        .doc(code);

      const codeSnap = await codeRef.get();

      if (!codeSnap.exists) {

        return sendError(
          res,
          404,
          "Receive Code not found."
        );

      }

      const codeData = codeSnap.data();

      const recipientUid =
        codeData.uid || codeData.userId || "";

      if (!recipientUid) {

        return sendError(
          res,
          400,
          "Receive Code is not linked to a wallet."
        );

      }

      if (recipientUid === req.user.uid) {

        return sendError(
          res,
          400,
          "You cannot transfer to yourself."
        );

      }

      // Recipient profile

      const recipientRef = db
        .collection("users")
        .doc(recipientUid);

      const recipientSnap = await recipientRef.get();

      if (!recipientSnap.exists) {

        return sendError(
          res,
          404,
          "Recipient wallet was not found."
        );

      }

      const recipient = recipientSnap.data();

      if (recipient.status !== "approved") {

        return sendError(
          res,
          403,
          "Recipient account is not approved."
        );

      }

      const recipientCountry = normalizeCountry(
        recipient.country
      );

      if (
        !recipientCountry ||
        recipientCountry !== senderCountry
      ) {

        return sendError(
          res,
          400,
          "Sender and recipient must use the same country wallet."
        );

      }

      return res.json({

        success: true,

        message: "Recipient found successfully.",

        recipient: {

          uid: recipientUid,

          name: recipient.name || "",

          country: recipientCountry

        }

      });

    } catch (error) {

      console.error(
        "LOOKUP API ERROR:",
        error
      );

      return sendError(
        res,
        500,
        "Unable to find recipient."
      );

    }

  }
);

// ==========================================
// DEMO WALLET TRANSFER
// POST /api/transfer
// ==========================================

app.post(
  "/api/transfer",
  requireAuth,
  async (req, res) => {

    try {

      // Real-money transfers are not enabled.

      if (!DEMO_MODE) {

        return sendError(
          res,
          403,
          "Demo transfer mode is disabled."
        );

      }

      const code = String(
        req.body.code || ""
      ).trim();

      const recipientUid = String(
        req.body.recipientUid || ""
      ).trim();

      const currency = String(
        req.body.currency || ""
      ).trim().toUpperCase();

      const amount = req.body.amount;

      const transferId = String(
        req.body.transferId || ""
      ).trim();

      const note = String(
        req.body.note || ""
      ).trim().slice(0, 200);

      // ======================================
      // INPUT VALIDATION
      // ======================================

      if (!/^\d{6}$/.test(code)) {

        return sendError(
          res,
          400,
          "Invalid Receive Code."
        );

      }

      if (
        !recipientUid ||
        recipientUid.length > 128
      ) {

        return sendError(
          res,
          400,
          "Invalid recipient account."
        );

      }

      if (
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(transferId)
      ) {

        return sendError(
          res,
          400,
          "Invalid transfer ID."
        );

      }

      if (
        currency !== "THB" &&
        currency !== "MMK"
      ) {

        return sendError(
          res,
          400,
          "Unsupported currency."
        );

      }

      if (!validAmount(amount, currency)) {

        return sendError(
          res,
          400,
          "Invalid transfer amount."
        );

      }

      if (recipientUid === req.user.uid) {

        return sendError(
          res,
          400,
          "You cannot transfer to yourself."
        );

      }

      // ======================================
      // FIRESTORE REFERENCES
      // ======================================

      const senderRef = db
        .collection("users")
        .doc(req.user.uid);

      const recipientRef = db
        .collection("users")
        .doc(recipientUid);

      const codeRef = db
        .collection("receiveCodes")
        .doc(code);

      const transferRef = db
        .collection("walletTransfers")
        .doc(transferId);

      // ======================================
      // FIRESTORE TRANSACTION
      // ======================================

      const transferResult = await db.runTransaction(
        async (transaction) => {

          // Read all documents before writing.

          const senderSnap =
            await transaction.get(senderRef);

          const recipientSnap =
            await transaction.get(recipientRef);

          const codeSnap =
            await transaction.get(codeRef);

          const existingTransferSnap =
            await transaction.get(transferRef);

          // ==================================
          // DUPLICATE TRANSFER PROTECTION
          // ==================================

          if (existingTransferSnap.exists) {

            throw new Error(
              "DUPLICATE_TRANSFER_ID"
            );

          }

          // ==================================
          // CHECK SENDER
          // ==================================

          if (!senderSnap.exists) {

            throw new Error(
              "SENDER_NOT_FOUND"
            );

          }

          const sender = senderSnap.data();

          if (sender.status !== "approved") {

            throw new Error(
              "SENDER_NOT_APPROVED"
            );

          }

          // ==================================
          // CHECK RECIPIENT
          // ==================================

          if (!recipientSnap.exists) {

            throw new Error(
              "RECIPIENT_NOT_FOUND"
            );

          }

          const recipient = recipientSnap.data();

          if (recipient.status !== "approved") {

            throw new Error(
              "RECIPIENT_NOT_APPROVED"
            );

          }

          // ==================================
          // CHECK RECEIVE CODE
          // ==================================

          if (!codeSnap.exists) {

            throw new Error(
              "RECEIVE_CODE_NOT_FOUND"
            );

          }

          const codeData = codeSnap.data();

          const linkedUid =
            codeData.uid || codeData.userId || "";

          if (linkedUid !== recipientUid) {

            throw new Error(
              "RECEIVE_CODE_MISMATCH"
            );

          }

          // ==================================
          // CHECK COUNTRY AND CURRENCY
          // ==================================

          const senderCountry = normalizeCountry(
            sender.country
          );

          const recipientCountry = normalizeCountry(
            recipient.country
          );

          if (
            !senderCountry ||
            senderCountry !== recipientCountry
          ) {

            throw new Error(
              "COUNTRY_MISMATCH"
            );

          }

          const expectedCurrency = getCurrency(
            senderCountry
          );

          if (currency !== expectedCurrency) {

            throw new Error(
              "CURRENCY_MISMATCH"
            );

          }

          // ==================================
          // CHECK BALANCES
          // ==================================

          const senderBalance = Number(
            sender.balance
          );

          const recipientBalance = Number(
            recipient.balance || 0
          );

          if (
            !Number.isFinite(senderBalance) ||
            senderBalance < 0
          ) {

            throw new Error(
              "INVALID_SENDER_BALANCE"
            );

          }

          if (
            !Number.isFinite(recipientBalance) ||
            recipientBalance < 0
          ) {

            throw new Error(
              "INVALID_RECIPIENT_BALANCE"
            );

          }

          if (senderBalance < amount) {

            throw new Error(
              "INSUFFICIENT_BALANCE"
            );

          }

          // ==================================
          // CALCULATE NEW BALANCES
          // ==================================

          const newSenderBalance =
            Number((senderBalance - amount).toFixed(2));

          const newRecipientBalance =
            Number((recipientBalance + amount).toFixed(2));

          // ==================================
          // UPDATE SENDER
          // ==================================

          transaction.update(
            senderRef,
            {
              balance: newSenderBalance,

              updatedAt: FieldValue.serverTimestamp()
            }
          );

          // ==================================
          // UPDATE RECIPIENT
          // ==================================

          transaction.update(
            recipientRef,
            {
              balance: newRecipientBalance,

              updatedAt: FieldValue.serverTimestamp()
            }
          );

          // ==================================
          // SAVE TRANSFER RECORD
          // ==================================

          transaction.set(
            transferRef,
            {

              transferId,

              senderUid: req.user.uid,

              recipientUid,

              senderName: sender.name || "",

              recipientName: recipient.name || "",

              amount,

              currency,

              note,

              type: "qr",

              mode: "DEMO",

              demo: true,

              status: "completed",

              senderBalanceBefore: senderBalance,

              senderBalanceAfter: newSenderBalance,

              recipientBalanceBefore: recipientBalance,

              recipientBalanceAfter: newRecipientBalance,

              createdAt: FieldValue.serverTimestamp(),

              updatedAt: FieldValue.serverTimestamp()

            }
          );

          return {

            transferId,

            amount,

            currency,

            senderBalance: newSenderBalance,

            recipientBalance: newRecipientBalance

          };

        }
      );

      // ======================================
      // SUCCESS RESPONSE
      // ======================================

      console.log(
        "DEMO TRANSFER SUCCESS:",
        transferResult.transferId
      );

      return res.json({

        success: true,

        message: "Demo transfer completed successfully.",

        transfer: transferResult

      });

    } catch (error) {

      console.error(
        "TRANSFER API ERROR:",
        error
      );

      // ======================================
      // ERROR MESSAGES
      // ======================================

      const errorMessages = {

        DUPLICATE_TRANSFER_ID:
          "This transfer ID has already been used.",

        SENDER_NOT_FOUND:
          "Sender wallet not found.",

        SENDER_NOT_APPROVED:
          "Sender account is not approved.",

        RECIPIENT_NOT_FOUND:
          "Recipient wallet not found.",

        RECIPIENT_NOT_APPROVED:
          "Recipient account is not approved.",

        RECEIVE_CODE_NOT_FOUND:
          "Receive Code not found.",

        RECEIVE_CODE_MISMATCH:
          "Receive Code does not match the recipient.",

        COUNTRY_MISMATCH:
          "Sender and recipient must use the same country wallet.",

        CURRENCY_MISMATCH:
          "Currency does not match the wallet country.",

        INVALID_SENDER_BALANCE:
          "Sender balance is invalid.",

        INVALID_RECIPIENT_BALANCE:
          "Recipient balance is invalid.",

        INSUFFICIENT_BALANCE:
          "Insufficient wallet balance."

      };

      const message =
        errorMessages[error.message];

      if (message) {

        return sendError(
          res,
          400,
          message
        );

      }

      return sendError(
        res,
        500,
        "Transfer failed. Please try again."
      );

    }

  }
);

// ==========================================
// UNKNOWN API ROUTE
// ==========================================

app.use("/api", (req, res) => {

  return sendError(
    res,
    404,
    "API endpoint not found."
  );

});

// ==========================================
// GLOBAL ERROR HANDLER
// ==========================================

app.use((error, req, res, next) => {

  console.error(
    "SERVER ERROR:",
    error
  );

  if (res.headersSent) {
    return next(error);
  }

  return sendError(
    res,
    500,
    "Internal server error."
  );

});

// ==========================================
// START SERVER
// ==========================================

app.listen(PORT, () => {

  console.log("--------------------------------");

  console.log("MYZEN MONEY BACKEND STARTED");

  console.log("PORT:", PORT);

  console.log("DEMO MODE:", DEMO_MODE);

  console.log("--------------------------------");

});
