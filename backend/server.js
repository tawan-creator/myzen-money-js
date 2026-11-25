
"use strict";

// ==========================================
// MYZEN MONEY - PRODUCTION WALLET BACKEND
// Wallet Transfers + Deposits + Admin Users
// Firebase Admin SDK v14
// ==========================================

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");

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
// CONFIGURATION
// ==========================================

const app = express();
const PORT = Number(process.env.PORT) || 3000;

const ADMIN_EMAIL = "tharwaiphyol@gmail.com";

app.disable("x-powered-by");

app.use(express.json({
  limit: "100kb"
}));

// ==========================================
// CORS
// ==========================================

const allowedOrigins = (
  process.env.FRONTEND_ORIGINS ||
  "https://myzenmoney.app,https://www.myzenmoney.app,http://localhost:5500,http://127.0.0.1:5500"
)
  .split(",")
  .map(origin => origin.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    console.warn("CORS BLOCKED:", origin);

    return callback(
      new Error("Origin not allowed by MYZEN MONEY CORS.")
    );
  },

  methods: ["GET", "POST", "PUT", "OPTIONS"],

  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "x-admin-bootstrap-secret"
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

    const serviceAccount = require(serviceAccountPath);

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
    error.message
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

function sendError(res, status, message, code) {
  return res.status(status).json({
    success: false,
    message,
    ...(code ? { code } : {})
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
    country === "burma"
  ) {
    return "Myanmar";
  }

  return "";
}

// ==========================================
// COUNTRY CURRENCY
// ==========================================

function getCurrency(country) {
  if (country === "Thailand") return "THB";
  if (country === "Myanmar") return "MMK";

  return "";
}

// ==========================================
// MONEY HELPERS
// ==========================================

function moneyToMinorUnits(amount, currency) {
  if (
    typeof amount !== "number" ||
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    return null;
  }

  let minorUnits;

  if (currency === "THB") {
    minorUnits = Math.round(amount * 100);

    if (
      Math.abs(amount * 100 - minorUnits) > 0.000001
    ) {
      return null;
    }

  } else if (currency === "MMK") {
    if (!Number.isInteger(amount)) {
      return null;
    }

    minorUnits = amount;

  } else {
    return null;
  }

  if (
    !Number.isSafeInteger(minorUnits) ||
    minorUnits <= 0
  ) {
    return null;
  }

  return minorUnits;
}

function balanceToMinorUnits(balance, currency) {
  const value = Number(balance ?? 0);

  if (!Number.isFinite(value) || value < 0) {
    return null;
  }

  if (currency === "THB") {
    const minor = Math.round(value * 100);

    if (
      Math.abs(value * 100 - minor) > 0.000001 ||
      !Number.isSafeInteger(minor)
    ) {
      return null;
    }

    return minor;
  }

  if (currency === "MMK") {
    if (
      !Number.isInteger(value) ||
      !Number.isSafeInteger(value)
    ) {
      return null;
    }

    return value;
  }

  return null;
}

function minorUnitsToMoney(value, currency) {
  if (currency === "THB") {
    return Number((value / 100).toFixed(2));
  }

  return value;
}

// ==========================================
// AUTHENTICATION
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

    if (!decodedToken.uid) {
      return sendError(
        res,
        401,
        "Invalid login session."
      );
    }

    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email || "",
      emailVerified: decodedToken.email_verified === true,
      admin: decodedToken.admin === true
    };

    req.firebaseAuth = firebaseAuth;

    return next();

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
// ADMIN AUTHORIZATION
// ==========================================

async function requireAdmin(req, res, next) {
  try {
    if (
      !req.user ||
      req.user.admin !== true ||
      String(req.user.email || "").toLowerCase() !==
        ADMIN_EMAIL.toLowerCase()
    ) {
      return sendError(
        res,
        403,
        "Admin access denied."
      );
    }

    return next();

  } catch (error) {
    console.error("ADMIN AUTH ERROR:", error);

    return sendError(
      res,
      500,
      "Unable to verify admin access."
    );
  }
}

// ==========================================
// HEALTH CHECK
// ==========================================

app.get("/api/health", (req, res) => {
  return res.json({
    success: true,
    message: "MYZEN MONEY PRODUCTION WALLET API IS RUNNING",
    transferMode: "WALLET_TO_WALLET",
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

      const currency = getCurrency(country);

      const balance = Number(profile.balance ?? 0);

      if (
        !Number.isFinite(balance) ||
        balance < 0
      ) {
        return sendError(
          res,
          400,
          "Wallet balance is invalid."
        );
      }

      return res.json({
        success: true,

        profile: {
          uid: req.user.uid,
          name: profile.name || "",
          country,
          currency,
          balance,
          status: profile.status
        }
      });

    } catch (error) {
      console.error("PROFILE API ERROR:", error);

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
      console.error("LOOKUP API ERROR:", error);

      return sendError(
        res,
        500,
        "Unable to find recipient."
      );
    }
  }
);

// ==========================================
// REAL WALLET TRANSFER
// POST /api/transfer
// ==========================================

app.post(
  "/api/transfer",
  requireAuth,
  async (req, res) => {
    try {
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

      const uuidPattern =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

      if (!uuidPattern.test(transferId)) {
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

      const amountMinor = moneyToMinorUnits(
        amount,
        currency
      );

      if (amountMinor === null) {
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

      const senderLedgerRef = db
        .collection("walletLedger")
        .doc(transferId + "_DEBIT");

      const recipientLedgerRef = db
        .collection("walletLedger")
        .doc(transferId + "_CREDIT");

      const result = await db.runTransaction(
        async (transaction) => {

          const existingTransferSnap =
            await transaction.get(transferRef);

          if (existingTransferSnap.exists) {
            const existing = existingTransferSnap.data();

            const sameRequest =
              existing.senderUid === req.user.uid &&
              existing.recipientUid === recipientUid &&
              existing.code === code &&
              existing.amount === amount &&
              existing.currency === currency;

            if (!sameRequest) {
              throw new Error("DUPLICATE_TRANSFER_ID");
            }

            if (existing.status !== "completed") {
              throw new Error("TRANSFER_NOT_COMPLETED");
            }

            return {
              transferId,
              amount: existing.amount,
              currency: existing.currency,
              senderBalance: existing.senderBalanceAfter,
              recipientBalance: existing.recipientBalanceAfter,
              alreadyProcessed: true
            };
          }

          const senderSnap =
            await transaction.get(senderRef);

          const recipientSnap =
            await transaction.get(recipientRef);

          const codeSnap =
            await transaction.get(codeRef);

          if (!senderSnap.exists) {
            throw new Error("SENDER_NOT_FOUND");
          }

          const sender = senderSnap.data();

          if (sender.status !== "approved") {
            throw new Error("SENDER_NOT_APPROVED");
          }

          if (!recipientSnap.exists) {
            throw new Error("RECIPIENT_NOT_FOUND");
          }

          const recipient = recipientSnap.data();

          if (recipient.status !== "approved") {
            throw new Error("RECIPIENT_NOT_APPROVED");
          }

          if (!codeSnap.exists) {
            throw new Error("RECEIVE_CODE_NOT_FOUND");
          }

          const codeData = codeSnap.data();

          const linkedUid =
            codeData.uid || codeData.userId || "";

          if (linkedUid !== recipientUid) {
            throw new Error("RECEIVE_CODE_MISMATCH");
          }

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
            throw new Error("COUNTRY_MISMATCH");
          }

          const expectedCurrency = getCurrency(
            senderCountry
          );

          if (currency !== expectedCurrency) {
            throw new Error("CURRENCY_MISMATCH");
          }

          const senderBalanceMinor =
            balanceToMinorUnits(sender.balance, currency);

          const recipientBalanceMinor =
            balanceToMinorUnits(recipient.balance, currency);

          if (senderBalanceMinor === null) {
            throw new Error("INVALID_SENDER_BALANCE");
          }

          if (recipientBalanceMinor === null) {
            throw new Error("INVALID_RECIPIENT_BALANCE");
          }

          if (senderBalanceMinor < amountMinor) {
            throw new Error("INSUFFICIENT_BALANCE");
          }

          const newSenderMinor =
            senderBalanceMinor - amountMinor;

          const newRecipientMinor =
            recipientBalanceMinor + amountMinor;

          if (!Number.isSafeInteger(newRecipientMinor)) {
            throw new Error("BALANCE_LIMIT_EXCEEDED");
          }

          const senderBefore = minorUnitsToMoney(
            senderBalanceMinor,
            currency
          );

          const recipientBefore = minorUnitsToMoney(
            recipientBalanceMinor,
            currency
          );

          const senderAfter = minorUnitsToMoney(
            newSenderMinor,
            currency
          );

          const recipientAfter = minorUnitsToMoney(
            newRecipientMinor,
            currency
          );

          transaction.update(senderRef, {
            balance: senderAfter,
            updatedAt: FieldValue.serverTimestamp()
          });

          transaction.update(recipientRef, {
            balance: recipientAfter,
            updatedAt: FieldValue.serverTimestamp()
          });

          transaction.set(transferRef, {
            transferId,

            senderUid: req.user.uid,
            recipientUid,

            senderName: sender.name || "",
            recipientName: recipient.name || "",

            code,

            amount,
            currency,
            note,

            type: "wallet_transfer",
            mode: "PRODUCTION",
            demo: false,

            status: "completed",

            senderBalanceBefore: senderBefore,
            senderBalanceAfter: senderAfter,

            recipientBalanceBefore: recipientBefore,
            recipientBalanceAfter: recipientAfter,

            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp()
          });

          transaction.set(senderLedgerRef, {
            ledgerId: transferId + "_DEBIT",
            transferId,

            uid: req.user.uid,
            counterpartyUid: recipientUid,

            direction: "debit",
            amount,
            currency,

            balanceBefore: senderBefore,
            balanceAfter: senderAfter,

            status: "completed",

            createdAt: FieldValue.serverTimestamp()
          });

          transaction.set(recipientLedgerRef, {
            ledgerId: transferId + "_CREDIT",
            transferId,

            uid: recipientUid,
            counterpartyUid: req.user.uid,

            direction: "credit",
            amount,
            currency,

            balanceBefore: recipientBefore,
            balanceAfter: recipientAfter,

            status: "completed",

            createdAt: FieldValue.serverTimestamp()
          });

          return {
            transferId,
            amount,
            currency,

            senderBalance: senderAfter,
            recipientBalance: recipientAfter,

            alreadyProcessed: false
          };
        }
      );

      console.log(
        "WALLET TRANSFER SUCCESS:",
        result.transferId,
        "SENDER:",
        req.user.uid,
        "RECIPIENT:",
        recipientUid,
        "AMOUNT:",
        result.amount,
        result.currency
      );

      return res.json({
        success: true,

        message: result.alreadyProcessed
          ? "Transfer was already completed."
          : "Wallet transfer completed successfully.",

        transfer: result
      });

    } catch (error) {
      console.error(
        "WALLET TRANSFER ERROR:",
        error
      );

      const errorMessages = {
        DUPLICATE_TRANSFER_ID:
          "This transfer ID has already been used for another request.",

        TRANSFER_NOT_COMPLETED:
          "This transfer is not completed. Please contact support.",

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
          "Insufficient wallet balance.",

        BALANCE_LIMIT_EXCEEDED:
          "Recipient wallet balance limit exceeded."
      };

      const message = errorMessages[error.message];

      if (message) {
        const status =
          error.message === "INSUFFICIENT_BALANCE" ? 400 :
          error.message === "SENDER_NOT_FOUND" ? 404 :
          error.message === "RECIPIENT_NOT_FOUND" ? 404 :
          error.message === "RECEIVE_CODE_NOT_FOUND" ? 404 :
          error.message === "SENDER_NOT_APPROVED" ? 403 :
          error.message === "RECIPIENT_NOT_APPROVED" ? 403 :
          400;

        return sendError(
          res,
          status,
          message,
          error.message
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
// DEPOSIT ROUTES
// ==========================================

const createDepositRoutes = require("./deposit-routes");

app.use(
  "/api",
  createDepositRoutes({
    db,
    FieldValue,
    requireAuth
  })
);

// ==========================================
// ADMIN USER MANAGEMENT
// GET /api/admin/users
// ==========================================

app.get(
  "/api/admin/users",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    try {
      const users = [];
      let pageToken;

      do {
        const result = await firebaseAuth.listUsers(
          1000,
          pageToken
        );

        const authUsers = result.users || [];

        for (let i = 0; i < authUsers.length; i += 100) {
          const batch = authUsers.slice(i, i + 100);

          const refs = batch.map(user =>
            db.collection("users").doc(user.uid)
          );

          const snapshots = await db.getAll(...refs);

          for (let j = 0; j < batch.length; j++) {
            const authUser = batch[j];
            const profileSnap = snapshots[j];

            const profile = profileSnap.exists
              ? profileSnap.data()
              : {};

            users.push({
              uid: authUser.uid,

              name:
                profile.name ||
                authUser.displayName ||
                "",

              email:
                profile.email ||
                authUser.email ||
                "",

              status:
                String(profile.status || "unknown")
                  .toLowerCase(),

              createdAt:
                authUser.metadata.creationTime || null,

              lastSignInTime:
                authUser.metadata.lastSignInTime || null,

              online: false
            });
          }
        }

        pageToken = result.pageToken;

      } while (pageToken);

      users.sort((a, b) => {
        return new Date(b.createdAt || 0) -
               new Date(a.createdAt || 0);
      });

      const approvedUsers = users.filter(
        user => user.status === "approved"
      ).length;

      const pendingUsers = users.filter(
        user => user.status === "pending"
      ).length;

      return res.json({
        success: true,

        stats: {
          totalUsers: users.length,
          activeUsers: 0,
          approvedUsers,
          pendingUsers
        },

        users
      });

    } catch (error) {
      console.error(
        "ADMIN USERS API ERROR:",
        error
      );

      return sendError(
        res,
        500,
        "Unable to load users."
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
  console.error("SERVER ERROR:", error);

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
  console.log("TRANSFER MODE: WALLET_TO_WALLET");
  console.log("DEPOSIT API: ENABLED");
  console.log("ADMIN USER MANAGEMENT: ENABLED");
  console.log("--------------------------------");
});
