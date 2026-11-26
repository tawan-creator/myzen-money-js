
"use strict";

const express = require("express");
const multer = require("multer");
const crypto = require("crypto");
const { Readable } = require("stream");
const cloudinary = require("cloudinary").v2;

const ADMIN_EMAIL = "tharwaiphyol@gmail.com";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true
});

// ==========================================
// FILE UPLOAD CONFIGURATION
// ==========================================

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1
  },
  fileFilter(req, file, callback) {
    const allowed = [
      "image/jpeg",
      "image/png",
      "image/webp"
    ];

    if (!allowed.includes(file.mimetype)) {
      return callback(
        new Error("Only JPG, PNG and WEBP images are allowed.")
      );
    }

    callback(null, true);
  }
});

// ==========================================
// COMMON HELPERS
// ==========================================

function error(res, status, message) {
  return res.status(status).json({
    success: false,
    message
  });
}

function normalizeCountry(value) {
  const country = String(value || "").trim().toLowerCase();

  if (["thailand", "th", "ไทย"].includes(country)) {
    return "Thailand";
  }

  if (["myanmar", "mm", "burma"].includes(country)) {
    return "Myanmar";
  }

  return "";
}

function currencyFor(country) {
  return country === "Thailand"
    ? "THB"
    : country === "Myanmar"
      ? "MMK"
      : "";
}

function toMinor(amount, currency) {
  if (
    typeof amount !== "number" ||
    !Number.isFinite(amount) ||
    amount <= 0
  ) return null;

  if (currency === "THB") {
    const value = Math.round(amount * 100);

    if (Math.abs(amount * 100 - value) > 0.000001) {
      return null;
    }

    return Number.isSafeInteger(value) ? value : null;
  }

  if (
    currency === "MMK" &&
    Number.isSafeInteger(amount)
  ) {
    return amount;
  }

  return null;
}

function fromMinor(value, currency) {
  return currency === "THB"
    ? Number((value / 100).toFixed(2))
    : value;
}

function requireAdmin(req, res, next) {
  if (
    !req.user ||
    String(req.user.email || "").toLowerCase() !== ADMIN_EMAIL ||
    req.user.admin !== true
  ) {
    return error(res, 403, "Admin permission required.");
  }

  next();
}

async function requireApprovedWallet(req, res) {
  const userSnap = await dbForRequest
    .collection("users")
    .doc(req.user.uid)
    .get();

  if (!userSnap.exists || userSnap.data().status !== "approved") {
    error(res, 403, "Approved wallet required.");
    return null;
  }

  return userSnap.data();
}

// ==========================================
// CLOUDINARY - PRIVATE DEPOSIT PROOFS
// ==========================================

function uploadToCloudinary(buffer, requestId) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        resource_type: "image",
        type: "authenticated",
        folder: "myzen-money/deposit-proofs",
        public_id: requestId,
        overwrite: false,
        allowed_formats: ["jpg", "jpeg", "png", "webp"]
      },
      (err, result) => {
        if (err) return reject(err);
        resolve(result);
      }
    );

    Readable.from(buffer).pipe(stream);
  });
}

function deleteCloudinaryAsset(publicId) {
  if (!publicId) return Promise.resolve();

  return cloudinary.uploader.destroy(publicId, {
    resource_type: "image",
    type: "authenticated",
    invalidate: true
  });
}

// ==========================================
// CLOUDINARY - PUBLIC PAYMENT QR IMAGES
// ==========================================

function uploadPaymentQR(buffer, methodId) {
  const safeId = String(methodId)
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 80);

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        resource_type: "image",
        folder: "myzen-money/payment-qrs",
        public_id: `qr_${safeId}`,
        overwrite: true,
        invalidate: true,
        allowed_formats: ["jpg", "jpeg", "png", "webp"]
      },
      (err, result) => {
        if (err) return reject(err);
        resolve(result);
      }
    );

    Readable.from(buffer).pipe(stream);
  });
}

// ==========================================
// EXCHANGE RATE HELPERS
// ==========================================

function validRate(value) {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value > 0 &&
    value <= 1000000000
  );
}

// ==========================================
// CREATE ROUTES
// ==========================================

function createDepositRoutes({
  db,
  FieldValue,
  requireAuth
}) {
  const router = express.Router();

  const settingsRef = db
    .collection("depositSettings")
    .doc("paymentMethods");

  const exchangeRatesRef = db
    .collection("depositSettings")
    .doc("exchangeRates");

  // ==========================================
  // ADMIN BOOTSTRAP
  // POST /api/admin/bootstrap
  // ==========================================

  router.post(
    "/admin/bootstrap",
    requireAuth,
    async (req, res) => {
      try {
        const secret = process.env.ADMIN_BOOTSTRAP_SECRET;
        const supplied = req.headers["x-admin-bootstrap-secret"];

        if (
          String(req.user.email || "").toLowerCase() !== ADMIN_EMAIL ||
          req.user.emailVerified !== true
        ) {
          return error(res, 403, "Verified admin email required.");
        }

        if (
          !secret ||
          typeof supplied !== "string" ||
          Buffer.byteLength(secret) !== Buffer.byteLength(supplied) ||
          !crypto.timingSafeEqual(
            Buffer.from(secret),
            Buffer.from(supplied)
          )
        ) {
          return error(res, 403, "Invalid bootstrap authorization.");
        }

        const user = await req.firebaseAuth.getUser(req.user.uid);

        if (user.customClaims?.admin === true) {
          return error(res, 409, "Admin is already configured.");
        }

        await req.firebaseAuth.setCustomUserClaims(
          req.user.uid,
          {
            ...(user.customClaims || {}),
            admin: true
          }
        );

        return res.json({
          success: true,
          message: "Admin permission enabled. Sign out and sign in again."
        });

      } catch (err) {
        console.error("ADMIN BOOTSTRAP:", err);
        return error(res, 500, "Admin setup failed.");
      }
    }
  );

  // ==========================================
  // PUBLIC ENABLED PAYMENT METHODS
  // GET /api/deposit/methods
  // ==========================================

  router.get(
    "/deposit/methods",
    requireAuth,
    async (req, res) => {
      try {
        const userSnap = await db
          .collection("users")
          .doc(req.user.uid)
          .get();

        if (
          !userSnap.exists ||
          userSnap.data().status !== "approved"
        ) {
          return error(res, 403, "Approved wallet required.");
        }

        const country = normalizeCountry(
          userSnap.data().country
        );

        const currency = currencyFor(country);

        const snap = await settingsRef.get();

        const methods = snap.exists
          ? snap.data().methods || []
          : [];

        return res.json({
          success: true,
          country,
          currency,
          methods: methods
            .filter(m =>
              m.enabled === true &&
              m.country === country &&
              m.currency === currency
            )
            .map(m => ({
              id: m.id,
              name: m.name,
              accountName: m.accountName,
              accountNumber: m.accountNumber,
              bank: m.bank || "",
              instructions: m.instructions || "",
              qrUrl: m.qrUrl || ""
            }))
        });

      } catch (err) {
        console.error("DEPOSIT METHODS:", err);
        return error(res, 500, "Unable to load payment methods.");
      }
    }
  );

  // ==========================================
  // PUBLIC EXCHANGE RATES
  // GET /api/exchange-rates
  // ==========================================

  router.get(
    "/exchange-rates",
    requireAuth,
    async (req, res) => {
      try {
        const userSnap = await db
          .collection("users")
          .doc(req.user.uid)
          .get();

        if (
          !userSnap.exists ||
          userSnap.data().status !== "approved"
        ) {
          return error(res, 403, "Approved wallet required.");
        }

        const snap = await exchangeRatesRef.get();
        const data = snap.exists ? snap.data() : {};

        return res.json({
          success: true,
          rates: {
            thbToMmk: validRate(data.thbToMmk)
              ? data.thbToMmk
              : null,
            mmkToThb: validRate(data.mmkToThb)
              ? data.mmkToThb
              : null
          }
        });

      } catch (err) {
        console.error("PUBLIC EXCHANGE RATES:", err);
        return error(res, 500, "Unable to load exchange rates.");
      }
    }
  );

  // ==========================================
  // CREATE DEPOSIT REQUEST
  // POST /api/deposits
  // multipart/form-data
  // ==========================================

  router.post(
    "/deposits",
    requireAuth,
    upload.single("proof"),
    async (req, res) => {
      let uploadedPublicId = "";

      try {
        const amount = Number(req.body.amount);
        const methodId = String(req.body.methodId || "").trim();

        const reference = String(
          req.body.transactionId || ""
        ).trim().slice(0, 100);

        const note = String(
          req.body.note || ""
        ).trim().slice(0, 300);

        if (!req.file) {
          return error(res, 400, "Deposit screenshot is required.");
        }

        if (!methodId || methodId.length > 100) {
          return error(res, 400, "Invalid payment method.");
        }

        if (!reference || reference.length < 3) {
          return error(res, 400, "Transaction reference is required.");
        }

        const userRef = db.collection("users").doc(req.user.uid);
        const userSnap = await userRef.get();

        if (!userSnap.exists) {
          return error(res, 404, "Wallet profile not found.");
        }

        const user = userSnap.data();

        if (user.status !== "approved") {
          return error(res, 403, "Your wallet is not approved.");
        }

        const country = normalizeCountry(user.country);
        const currency = currencyFor(country);

        if (!currency) {
          return error(res, 400, "Invalid wallet country.");
        }

        const amountMinor = toMinor(amount, currency);

        if (amountMinor === null) {
          return error(res, 400, "Invalid deposit amount.");
        }

        const settingsSnap = await settingsRef.get();

        const methods = settingsSnap.exists
          ? settingsSnap.data().methods || []
          : [];

        const method = methods.find(m =>
          m.id === methodId &&
          m.enabled === true &&
          m.country === country &&
          m.currency === currency
        );

        if (!method) {
          return error(res, 400, "Payment method is unavailable.");
        }

        const requestRef = db
          .collection("depositRequests")
          .doc();

        const referenceHash = crypto
          .createHash("sha256")
          .update(
            `${country}|${methodId}|${reference.toLowerCase()}`
          )
          .digest("hex");

        const referenceRef = db
          .collection("depositReferences")
          .doc(referenceHash);

        const image = await uploadToCloudinary(
          req.file.buffer,
          requestRef.id
        );

        uploadedPublicId = image.public_id;

        await db.runTransaction(async transaction => {
          const duplicateSnap = await transaction.get(referenceRef);

          if (duplicateSnap.exists) {
            throw new Error("DUPLICATE_REFERENCE");
          }

          transaction.create(referenceRef, {
            requestId: requestRef.id,
            uid: req.user.uid,
            createdAt: FieldValue.serverTimestamp()
          });

          transaction.create(requestRef, {
            uid: req.user.uid,
            userName: user.name || "",
            country,
            currency,
            amount,
            amountMinor,
            methodId,
            methodName: method.name,
            transactionId: reference,
            note,

            proof: {
              publicId: image.public_id,
              format: image.format,
              resourceType: image.resource_type,
              assetType: "authenticated"
            },

            status: "pending",
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp()
          });
        });

        return res.status(201).json({
          success: true,
          message: "Deposit request submitted for manual review.",
          requestId: requestRef.id,
          status: "pending"
        });

      } catch (err) {
        if (uploadedPublicId) {
          await deleteCloudinaryAsset(uploadedPublicId)
            .catch(cleanupError =>
              console.error("CLOUDINARY CLEANUP:", cleanupError)
            );
        }

        if (err.message === "DUPLICATE_REFERENCE") {
          return error(
            res,
            409,
            "This transaction reference was already submitted."
          );
        }

        console.error("CREATE DEPOSIT:", err);
        return error(res, 500, "Unable to submit deposit request.");
      }
    }
  );

  // ==========================================
  // MY DEPOSIT HISTORY
  // GET /api/deposits/my
  // ==========================================

  router.get(
    "/deposits/my",
    requireAuth,
    async (req, res) => {
      try {
        const snap = await db
          .collection("depositRequests")
          .where("uid", "==", req.user.uid)
          .limit(100)
          .get();

        const deposits = snap.docs
          .map(doc => {
            const data = doc.data();

            return {
              id: doc.id,
              amount: data.amount,
              currency: data.currency,
              methodName: data.methodName,
              transactionId: data.transactionId,
              status: data.status,
              createdAt: data.createdAt?.toDate?.().toISOString() || null
            };
          })
          .sort((a, b) =>
            String(b.createdAt || "").localeCompare(
              String(a.createdAt || "")
            )
          );

        return res.json({
          success: true,
          deposits
        });

      } catch (err) {
        console.error("MY DEPOSITS:", err);
        return error(res, 500, "Unable to load deposit history.");
      }
    }
  );

  // ==========================================
  // MY PRIVATE DEPOSIT PROOF
  // GET /api/deposits/my/:id/proof
  // ==========================================

  router.get(
    "/deposits/my/:id/proof",
    requireAuth,
    async (req, res) => {
      try {
        const depositId = String(req.params.id || "").trim();

        if (
          !depositId ||
          !/^[A-Za-z0-9_-]{1,150}$/.test(depositId)
        ) {
          return error(res, 400, "Invalid deposit request ID.");
        }

        const snap = await db
          .collection("depositRequests")
          .doc(depositId)
          .get();

        if (!snap.exists) {
          return error(res, 404, "Deposit request not found.");
        }

        const deposit = snap.data();

        // Only the owner can view this deposit slip.
        if (deposit.uid !== req.user.uid) {
          return error(res, 403, "You cannot view this deposit slip.");
        }

        const proof = deposit.proof;

        if (
          !proof ||
          !proof.publicId ||
          !proof.format ||
          proof.assetType !== "authenticated"
        ) {
          return error(res, 404, "Deposit screenshot not found.");
        }

        const url = cloudinary.utils.private_download_url(
          proof.publicId,
          proof.format,
          {
            resource_type: "image",
            type: "authenticated",
            expires_at: Math.floor(Date.now() / 1000) + 300
          }
        );

        return res.json({
          success: true,
          depositId,
          url,
          expiresInSeconds: 300
        });

      } catch (err) {
        console.error("MY DEPOSIT PROOF:", err);
        return error(
          res,
          500,
          "Unable to retrieve your deposit screenshot."
        );
      }
    }
  );

  // ==========================================
  // ADMIN DEPOSIT LIST
  // GET /api/admin/deposits
  // ==========================================

  router.get(
    "/admin/deposits",
    requireAuth,
    requireAdmin,
    async (req, res) => {
      try {
        const snap = await db
          .collection("depositRequests")
          .limit(100)
          .get();

        const deposits = snap.docs
          .map(doc => {
            const data = doc.data();

            return {
              id: doc.id,
              uid: data.uid,
              userName: data.userName || "",
              country: data.country,
              currency: data.currency,
              amount: data.amount,
              methodName: data.methodName,
              transactionId: data.transactionId,
              note: data.note || "",
              status: data.status,
              createdAt: data.createdAt?.toDate?.().toISOString() || null
            };
          })
          .sort((a, b) =>
            String(b.createdAt || "").localeCompare(
              String(a.createdAt || "")
            )
          );

        return res.json({
          success: true,
          deposits
        });

      } catch (err) {
        console.error("ADMIN DEPOSITS:", err);
        return error(res, 500, "Unable to load deposit requests.");
      }
    }
  );

  // ==========================================
  // ADMIN VIEW PRIVATE PROOF
  // GET /api/admin/deposits/:id/proof
  // ==========================================

  router.get(
    "/admin/deposits/:id/proof",
    requireAuth,
    requireAdmin,
    async (req, res) => {
      try {
        const snap = await db
          .collection("depositRequests")
          .doc(req.params.id)
          .get();

        if (!snap.exists) {
          return error(res, 404, "Deposit request not found.");
        }

        const proof = snap.data().proof;

        if (!proof?.publicId || !proof?.format) {
          return error(res, 404, "Screenshot not found.");
        }

        const url = cloudinary.utils.private_download_url(
          proof.publicId,
          proof.format,
          {
            resource_type: "image",
            type: "authenticated",
            expires_at: Math.floor(Date.now() / 1000) + 300
          }
        );

        return res.json({
          success: true,
          url,
          expiresInSeconds: 300
        });

      } catch (err) {
        console.error("ADMIN PROOF:", err);
        return error(res, 500, "Unable to retrieve screenshot.");
      }
    }
  );

  // ==========================================
  // ADMIN APPROVE DEPOSIT
  // POST /api/admin/deposits/:id/approve
  // ==========================================

  router.post(
    "/admin/deposits/:id/approve",
    requireAuth,
    requireAdmin,
    async (req, res) => {
      try {
        const requestRef = db
          .collection("depositRequests")
          .doc(req.params.id);

        const result = await db.runTransaction(async transaction => {
          const requestSnap = await transaction.get(requestRef);

          if (!requestSnap.exists) {
            throw new Error("DEPOSIT_NOT_FOUND");
          }

          const deposit = requestSnap.data();

          if (deposit.status === "approved") {
            return {
              alreadyProcessed: true,
              amount: deposit.amount,
              currency: deposit.currency
            };
          }

          if (deposit.status !== "pending") {
            throw new Error("DEPOSIT_NOT_PENDING");
          }

          const userRef = db
            .collection("users")
            .doc(deposit.uid);

          const ledgerRef = db
            .collection("walletLedger")
            .doc(`deposit_${requestRef.id}`);

          const userSnap = await transaction.get(userRef);
          const ledgerSnap = await transaction.get(ledgerRef);

          if (!userSnap.exists) {
            throw new Error("USER_NOT_FOUND");
          }

          if (ledgerSnap.exists) {
            throw new Error("LEDGER_ALREADY_EXISTS");
          }

          const user = userSnap.data();

          if (user.status !== "approved") {
            throw new Error("USER_NOT_APPROVED");
          }

          const country = normalizeCountry(user.country);
          const currency = currencyFor(country);

          if (
            country !== deposit.country ||
            currency !== deposit.currency
          ) {
            throw new Error("CURRENCY_MISMATCH");
          }

          const amountMinor = toMinor(
            deposit.amount,
            currency
          );

          const oldBalance = Number(user.balance || 0);

          const oldMinor = currency === "THB"
            ? Math.round(oldBalance * 100)
            : oldBalance;

          if (
            amountMinor === null ||
            !Number.isSafeInteger(oldMinor) ||
            oldMinor < 0
          ) {
            throw new Error("INVALID_BALANCE");
          }

          const newMinor = oldMinor + amountMinor;

          if (!Number.isSafeInteger(newMinor)) {
            throw new Error("BALANCE_LIMIT");
          }

          const before = fromMinor(oldMinor, currency);
          const after = fromMinor(newMinor, currency);

          transaction.update(userRef, {
            balance: after,
            updatedAt: FieldValue.serverTimestamp()
          });

          transaction.update(requestRef, {
            status: "approved",
            reviewedBy: req.user.uid,
            reviewedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
            balanceAfter: after
          });

          transaction.create(ledgerRef, {
            ledgerId: `deposit_${requestRef.id}`,
            uid: deposit.uid,
            direction: "credit",
            type: "deposit",
            amount: deposit.amount,
            currency,
            balanceBefore: before,
            balanceAfter: after,
            referenceId: requestRef.id,
            status: "completed",
            createdAt: FieldValue.serverTimestamp()
          });

          return {
            alreadyProcessed: false,
            amount: deposit.amount,
            currency,
            balanceAfter: after
          };
        });

        return res.json({
          success: true,
          message: result.alreadyProcessed
            ? "Deposit was already approved."
            : "Deposit approved successfully.",
          result
        });

      } catch (err) {
        console.error("APPROVE DEPOSIT:", err);

        const messages = {
          DEPOSIT_NOT_FOUND: [404, "Deposit not found."],
          DEPOSIT_NOT_PENDING: [409, "Deposit is not pending."],
          USER_NOT_FOUND: [404, "Wallet user not found."],
          USER_NOT_APPROVED: [403, "Wallet user is not approved."],
          CURRENCY_MISMATCH: [400, "Deposit currency mismatch."],
          INVALID_BALANCE: [400, "Wallet balance is invalid."],
          BALANCE_LIMIT: [400, "Wallet balance limit exceeded."],
          LEDGER_ALREADY_EXISTS: [409, "Deposit ledger already exists."]
        };

        const result = messages[err.message];

        return result
          ? error(res, result[0], result[1])
          : error(res, 500, "Unable to approve deposit.");
      }
    }
  );

  // ==========================================
  // ADMIN REJECT DEPOSIT
  // POST /api/admin/deposits/:id/reject
  // ==========================================

  router.post(
    "/admin/deposits/:id/reject",
    requireAuth,
    requireAdmin,
    async (req, res) => {
      try {
        const requestRef = db
          .collection("depositRequests")
          .doc(req.params.id);

        await db.runTransaction(async transaction => {
          const snap = await transaction.get(requestRef);

          if (!snap.exists) {
            throw new Error("DEPOSIT_NOT_FOUND");
          }

          if (snap.data().status !== "pending") {
            throw new Error("DEPOSIT_NOT_PENDING");
          }

          transaction.update(requestRef, {
            status: "rejected",
            reviewedBy: req.user.uid,
            reviewedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
            rejectionReason: String(
              req.body.reason || "Rejected by administrator"
            ).slice(0, 300)
          });
        });

        return res.json({
          success: true,
          message: "Deposit rejected. Wallet balance was not changed."
        });

      } catch (err) {
        console.error("REJECT DEPOSIT:", err);

        if (err.message === "DEPOSIT_NOT_FOUND") {
          return error(res, 404, "Deposit not found.");
        }

        if (err.message === "DEPOSIT_NOT_PENDING") {
          return error(res, 409, "Deposit is not pending.");
        }

        return error(res, 500, "Unable to reject deposit.");
      }
    }
  );

  // ==========================================
  // ADMIN PAYMENT METHOD CONFIGURATION
  // GET /api/admin/deposit/methods
  // PUT /api/admin/deposit/methods
  // ==========================================

  router.get(
    "/admin/deposit/methods",
    requireAuth,
    requireAdmin,
    async (req, res) => {
      try {
        const snap = await settingsRef.get();

        return res.json({
          success: true,
          methods: snap.exists
            ? snap.data().methods || []
            : []
        });

      } catch (err) {
        console.error("ADMIN PAYMENT METHODS:", err);
        return error(res, 500, "Unable to load payment methods.");
      }
    }
  );

  router.put(
    "/admin/deposit/methods",
    requireAuth,
    requireAdmin,
    async (req, res) => {
      try {
        const methods = req.body.methods;

        if (!Array.isArray(methods) || methods.length > 30) {
          return error(res, 400, "Invalid payment methods list.");
        }

        const oldSnap = await settingsRef.get();

        const oldMethods = oldSnap.exists
          ? oldSnap.data().methods || []
          : [];

        const clean = [];
        const ids = new Set();

        for (const method of methods) {
          const id = String(method.id || "").trim();
          const country = normalizeCountry(method.country);
          const currency = currencyFor(country);

          const name = String(method.name || "").trim();

          const accountName = String(
            method.accountName || ""
          ).trim();

          const accountNumber = String(
            method.accountNumber || ""
          ).trim();

          const instructions = String(
            method.instructions || ""
          ).trim().slice(0, 1000);

          const bank = String(
            method.bank || ""
          ).trim().slice(0, 100);

          if (
            !id ||
            id.length > 100 ||
            ids.has(id) ||
            !country ||
            method.currency !== currency ||
            !name ||
            name.length > 100 ||
            !accountName ||
            accountName.length > 150 ||
            !accountNumber ||
            accountNumber.length > 100
          ) {
            return error(
              res,
              400,
              "Invalid payment method configuration."
            );
          }

          ids.add(id);

          // Preserve existing QR when editing payment method details.
          const oldMethod = oldMethods.find(m => m.id === id);

          clean.push({
            id,
            country,
            currency,
            name,
            accountName,
            accountNumber,
            instructions,
            bank,
            enabled: method.enabled === true,
            qrUrl: oldMethod?.qrUrl || "",
            qrPublicId: oldMethod?.qrPublicId || ""
          });
        }

        await settingsRef.set({
          methods: clean,
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: req.user.uid
        });

        return res.json({
          success: true,
          message: "Payment methods saved.",
          methods: clean
        });

      } catch (err) {
        console.error("SAVE PAYMENT METHODS:", err);
        return error(res, 500, "Unable to save payment methods.");
      }
    }
  );

  // ==========================================
  // ADMIN UPLOAD / REPLACE PAYMENT QR
  // POST /api/admin/deposit/methods/:id/qr
  // multipart/form-data field: qr
  // ==========================================

  router.post(
    "/admin/deposit/methods/:id/qr",
    requireAuth,
    requireAdmin,
    upload.single("qr"),
    async (req, res) => {
      try {
        const methodId = String(req.params.id || "").trim();

        if (!methodId || methodId.length > 100) {
          return error(res, 400, "Invalid payment method ID.");
        }

        if (!req.file) {
          return error(res, 400, "QR image is required.");
        }

        const snap = await settingsRef.get();

        const methods = snap.exists
          ? snap.data().methods || []
          : [];

        const methodIndex = methods.findIndex(
          m => m.id === methodId
        );

        if (methodIndex === -1) {
          return error(res, 404, "Payment method not found.");
        }

        const image = await uploadPaymentQR(
          req.file.buffer,
          methodId
        );

        const updatedMethods = [...methods];

        updatedMethods[methodIndex] = {
          ...updatedMethods[methodIndex],
          qrUrl: image.secure_url,
          qrPublicId: image.public_id
        };

        await settingsRef.set(
          {
            methods: updatedMethods,
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: req.user.uid
          },
          { merge: true }
        );

        return res.json({
          success: true,
          message: "Payment QR uploaded successfully.",
          methodId,
          qrUrl: image.secure_url
        });

      } catch (err) {
        console.error("UPLOAD PAYMENT QR:", err);
        return error(res, 500, "Unable to upload payment QR.");
      }
    }
  );

  // ==========================================
  // ADMIN EXCHANGE RATE MANAGEMENT
  // GET /api/admin/exchange-rates
  // ==========================================

  router.get(
    "/admin/exchange-rates",
    requireAuth,
    requireAdmin,
    async (req, res) => {
      try {
        const snap = await exchangeRatesRef.get();
        const data = snap.exists ? snap.data() : {};

        return res.json({
          success: true,
          rates: {
            thbToMmk: validRate(data.thbToMmk)
              ? data.thbToMmk
              : null,
            mmkToThb: validRate(data.mmkToThb)
              ? data.mmkToThb
              : null
          }
        });

      } catch (err) {
        console.error("ADMIN EXCHANGE RATES:", err);
        return error(res, 500, "Unable to load exchange rates.");
      }
    }
  );

  // ==========================================
  // ADMIN SAVE EXCHANGE RATES
  // PUT /api/admin/exchange-rates
  // ==========================================

  router.put(
    "/admin/exchange-rates",
    requireAuth,
    requireAdmin,
    async (req, res) => {
      try {
        const body = req.body || {};

        const hasThbRate = Object.prototype.hasOwnProperty.call(
          body,
          "thbToMmk"
        );

        const hasMmkRate = Object.prototype.hasOwnProperty.call(
          body,
          "mmkToThb"
        );

        if (!hasThbRate && !hasMmkRate) {
          return error(res, 400, "No exchange rate provided.");
        }

        if (hasThbRate && !validRate(body.thbToMmk)) {
          return error(res, 400, "Invalid THB to MMK rate.");
        }

        if (hasMmkRate && !validRate(body.mmkToThb)) {
          return error(res, 400, "Invalid MMK to THB rate.");
        }

        const updates = {
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: req.user.uid
        };

        if (hasThbRate) {
          updates.thbToMmk = body.thbToMmk;
        }

        if (hasMmkRate) {
          updates.mmkToThb = body.mmkToThb;
        }

        await exchangeRatesRef.set(updates, { merge: true });

        const savedSnap = await exchangeRatesRef.get();
        const saved = savedSnap.data() || {};

        return res.json({
          success: true,
          message: "Exchange rates saved.",
          rates: {
            thbToMmk: validRate(saved.thbToMmk)
              ? saved.thbToMmk
              : null,
            mmkToThb: validRate(saved.mmkToThb)
              ? saved.mmkToThb
              : null
          }
        });

      } catch (err) {
        console.error("SAVE EXCHANGE RATES:", err);
        return error(res, 500, "Unable to save exchange rates.");
      }
    }
  );

  // ==========================================
  // INTERNATIONAL TRANSFER - USER SUBMIT
  // POST /api/international-transfers
  // ==========================================

  router.post(
    "/international-transfers",
    requireAuth,
    async (req, res) => {
      try {
        const body = req.body || {};

        const idempotencyKey = String(
          body.idempotencyKey || ""
        ).trim();

        if (
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey)
        ) {
          return error(res, 400, "Invalid transfer request ID.");
        }

        const sendAmount = body.sendAmount;

        const recipientBank = String(
          body.recipientBank || ""
        ).trim().slice(0, 100);

        const accountNumber = String(
          body.accountNumber || ""
        ).trim().slice(0, 100);

        const recipientName = String(
          body.recipientName || ""
        ).trim().slice(0, 150);

        const recipientPhone = String(
          body.recipientPhone || ""
        ).trim().slice(0, 50);

        const note = String(
          body.note || ""
        ).trim().slice(0, 300);

        if (
          !recipientBank ||
          !accountNumber ||
          !recipientName ||
          !recipientPhone
        ) {
          return error(res, 400, "Please complete recipient information.");
        }

        if (
          recipientBank.length > 100 ||
          accountNumber.length > 100 ||
          recipientName.length > 150 ||
          recipientPhone.length > 50
        ) {
          return error(res, 400, "Recipient information is too long.");
        }

        const userRef = db
          .collection("users")
          .doc(req.user.uid);

        const requestRef = db
          .collection("internationalTransfers")
          .doc(idempotencyKey);

        const debitLedgerRef = db
          .collection("walletLedger")
          .doc(`international_${idempotencyKey}_DEBIT`);

        const result = await db.runTransaction(async transaction => {
          // Read all documents before writing.
          const requestSnap = await transaction.get(requestRef);

          if (requestSnap.exists) {
            const existing = requestSnap.data();

            if (existing.senderUid !== req.user.uid) {
              throw new Error("REQUEST_ID_CONFLICT");
            }

            return {
              alreadySubmitted: true,
              requestId: requestRef.id,
              status: existing.status
            };
          }

          const userSnap = await transaction.get(userRef);
          const ratesSnap = await transaction.get(exchangeRatesRef);

          if (!userSnap.exists) {
            throw new Error("USER_NOT_FOUND");
          }

          const user = userSnap.data();

          if (user.status !== "approved") {
            throw new Error("USER_NOT_APPROVED");
          }

          const fromCountry = normalizeCountry(user.country);
          const sendCurrency = currencyFor(fromCountry);

          if (!sendCurrency) {
            throw new Error("INVALID_COUNTRY");
          }

          const toCountry = fromCountry === "Thailand"
            ? "Myanmar"
            : "Thailand";

          const receiveCurrency = currencyFor(toCountry);

          const sendMinor = toMinor(
            sendAmount,
            sendCurrency
          );

          if (sendMinor === null) {
            throw new Error("INVALID_AMOUNT");
          }

          const rates = ratesSnap.exists
            ? ratesSnap.data()
            : {};

          const exchangeRate = fromCountry === "Thailand"
            ? rates.thbToMmk
            : rates.mmkToThb;

          if (!validRate(exchangeRate)) {
            throw new Error("RATE_UNAVAILABLE");
          }

          const rawReceiveAmount = sendAmount * exchangeRate;

          const receiveAmount = receiveCurrency === "MMK"
            ? Math.round(rawReceiveAmount)
            : Number(rawReceiveAmount.toFixed(2));

          if (
            !Number.isFinite(receiveAmount) ||
            receiveAmount <= 0
          ) {
            throw new Error("INVALID_RECEIVE_AMOUNT");
          }

          const balance = Number(user.balance || 0);

          if (!Number.isFinite(balance) || balance < 0) {
            throw new Error("INVALID_BALANCE");
          }

          const balanceBeforeMinor = sendCurrency === "THB"
            ? Math.round(balance * 100)
            : balance;

          if (
            !Number.isSafeInteger(balanceBeforeMinor) ||
            balanceBeforeMinor < 0 ||
            (
              sendCurrency === "THB" &&
              Math.abs(balance * 100 - balanceBeforeMinor) > 0.000001
            )
          ) {
            throw new Error("INVALID_BALANCE");
          }

          if (balanceBeforeMinor < sendMinor) {
            throw new Error("INSUFFICIENT_BALANCE");
          }

          const balanceAfterMinor =
            balanceBeforeMinor - sendMinor;

          const balanceBefore = fromMinor(
            balanceBeforeMinor,
            sendCurrency
          );

          const balanceAfter = fromMinor(
            balanceAfterMinor,
            sendCurrency
          );

          const senderName = String(
            user.name || user.fullName || ""
          ).trim().slice(0, 150);

          // Debit wallet.
          transaction.update(userRef, {
            balance: balanceAfter,
            updatedAt: FieldValue.serverTimestamp()
          });

          // Create transfer request.
          transaction.create(requestRef, {
            senderUid: req.user.uid,
            senderName,
            senderEmail: String(req.user.email || ""),
            fromCountry,
            toCountry,
            sendCurrency,
            receiveCurrency,
            sendAmount,
            receiveAmount,
            exchangeRate,
            recipientBank,
            accountNumber,
            recipientName,
            recipientPhone,
            note,
            status: "pending",
            balanceBefore,
            balanceAfter,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp()
          });

          // Create debit ledger.
          transaction.create(debitLedgerRef, {
            ledgerId: `international_${idempotencyKey}_DEBIT`,
            uid: req.user.uid,
            direction: "debit",
            type: "international_transfer",
            amount: sendAmount,
            currency: sendCurrency,
            balanceBefore,
            balanceAfter,
            referenceId: idempotencyKey,
            status: "completed",
            createdAt: FieldValue.serverTimestamp()
          });

          return {
            alreadySubmitted: false,
            requestId: requestRef.id,
            status: "pending",
            sendAmount,
            sendCurrency,
            receiveAmount,
            receiveCurrency,
            exchangeRate,
            balanceAfter
          };
        });

        return res.status(
          result.alreadySubmitted ? 200 : 201
        ).json({
          success: true,
          message: result.alreadySubmitted
            ? "This transfer was already submitted."
            : "International transfer submitted successfully.",
          result
        });

      } catch (err) {
        console.error("INTERNATIONAL TRANSFER SUBMIT:", err);

        const messages = {
          REQUEST_ID_CONFLICT: [409, "Transfer request ID conflict."],
          USER_NOT_FOUND: [404, "Wallet profile not found."],
          USER_NOT_APPROVED: [403, "Approved wallet required."],
          INVALID_COUNTRY: [400, "Invalid wallet country."],
          INVALID_AMOUNT: [400, "Invalid transfer amount."],
          RATE_UNAVAILABLE: [400, "Exchange rate is unavailable."],
          INVALID_RECEIVE_AMOUNT: [400, "Invalid receive amount."],
          INVALID_BALANCE: [400, "Wallet balance is invalid."],
          INSUFFICIENT_BALANCE: [400, "Insufficient wallet balance."]
        };

        const result = messages[err.message];

        return result
          ? error(res, result[0], result[1])
          : error(res, 500, "Unable to submit international transfer.");
      }
    }
  );

  // ==========================================
  // ADMIN - INTERNATIONAL TRANSFER LIST
  // GET /api/admin/international-transfers
  // ==========================================

  router.get(
    "/admin/international-transfers",
    requireAuth,
    requireAdmin,
    async (req, res) => {
      try {
        const snap = await db
          .collection("internationalTransfers")
          .limit(100)
          .get();

        const transfers = snap.docs
          .map(doc => {
            const data = doc.data();

            return {
              id: doc.id,
              senderUid: data.senderUid,
              senderName: data.senderName || "",
              senderEmail: data.senderEmail || "",
              fromCountry: data.fromCountry,
              toCountry: data.toCountry,
              sendCurrency: data.sendCurrency,
              receiveCurrency: data.receiveCurrency,
              sendAmount: data.sendAmount,
              receiveAmount: data.receiveAmount,
              exchangeRate: data.exchangeRate,
              recipientBank: data.recipientBank,
              accountNumber: data.accountNumber,
              recipientName: data.recipientName,
              recipientPhone: data.recipientPhone,
              note: data.note || "",
              status: data.status,
              createdAt: data.createdAt?.toDate?.().toISOString() || null
            };
          })
          .sort((a, b) =>
            String(b.createdAt || "").localeCompare(
              String(a.createdAt || "")
            )
          );

        return res.json({
          success: true,
          transfers
        });

      } catch (err) {
        console.error("ADMIN INTERNATIONAL TRANSFERS:", err);
        return error(res, 500, "Unable to load international transfers.");
      }
    }
  );

  // ==========================================
  // ADMIN - APPROVE INTERNATIONAL TRANSFER
  // POST /api/admin/international-transfers/:id/approve
  // ==========================================

  router.post(
    "/admin/international-transfers/:id/approve",
    requireAuth,
    requireAdmin,
    async (req, res) => {
      try {
        const id = String(req.params.id || "");

        if (!/^[A-Za-z0-9_-]{1,150}$/.test(id)) {
          return error(res, 400, "Invalid transfer ID.");
        }

        const requestRef = db
          .collection("internationalTransfers")
          .doc(id);

        const result = await db.runTransaction(async transaction => {
          const snap = await transaction.get(requestRef);

          if (!snap.exists) {
            throw new Error("TRANSFER_NOT_FOUND");
          }

          const transfer = snap.data();

          if (transfer.status === "approved") {
            return { alreadyProcessed: true };
          }

          if (transfer.status !== "pending") {
            throw new Error("TRANSFER_NOT_PENDING");
          }

          transaction.update(requestRef, {
            status: "approved",
            reviewedBy: req.user.uid,
            reviewedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp()
          });

          return { alreadyProcessed: false };
        });

        return res.json({
          success: true,
          message: result.alreadyProcessed
            ? "Transfer was already approved."
            : "Transfer approved. Complete the external bank payout manually.",
          result
        });

      } catch (err) {
        console.error("APPROVE INTERNATIONAL TRANSFER:", err);

        if (err.message === "TRANSFER_NOT_FOUND") {
          return error(res, 404, "Transfer not found.");
        }

        if (err.message === "TRANSFER_NOT_PENDING") {
          return error(res, 409, "Transfer is not pending.");
        }

        return error(res, 500, "Unable to approve transfer.");
      }
    }
  );

  // ==========================================
  // ADMIN - REJECT INTERNATIONAL TRANSFER
  // POST /api/admin/international-transfers/:id/reject
  // Reject = refund sender wallet exactly once.
  // ==========================================

  router.post(
    "/admin/international-transfers/:id/reject",
    requireAuth,
    requireAdmin,
    async (req, res) => {
      try {
        const id = String(req.params.id || "");

        if (!/^[A-Za-z0-9_-]{1,150}$/.test(id)) {
          return error(res, 400, "Invalid transfer ID.");
        }

        const reason = String(
          req.body?.reason || "Rejected by administrator"
        ).trim().slice(0, 300);

        const requestRef = db
          .collection("internationalTransfers")
          .doc(id);

        const result = await db.runTransaction(async transaction => {
          const requestSnap = await transaction.get(requestRef);

          if (!requestSnap.exists) {
            throw new Error("TRANSFER_NOT_FOUND");
          }

          const transfer = requestSnap.data();

          if (transfer.status === "rejected") {
            return { alreadyProcessed: true };
          }

          if (transfer.status !== "pending") {
            throw new Error("TRANSFER_NOT_PENDING");
          }

          const userRef = db
            .collection("users")
            .doc(transfer.senderUid);

          const refundLedgerRef = db
            .collection("walletLedger")
            .doc(`international_${id}_REFUND`);

          const userSnap = await transaction.get(userRef);
          const refundLedgerSnap = await transaction.get(refundLedgerRef);

          if (!userSnap.exists) {
            throw new Error("USER_NOT_FOUND");
          }

          if (refundLedgerSnap.exists) {
            throw new Error("REFUND_ALREADY_EXISTS");
          }

          const user = userSnap.data();

          const currency = transfer.sendCurrency;

          if (
            !["THB", "MMK"].includes(currency) ||
            currencyFor(normalizeCountry(user.country)) !== currency
          ) {
            throw new Error("CURRENCY_MISMATCH");
          }

          const amountMinor = toMinor(
            transfer.sendAmount,
            currency
          );

          const currentBalance = Number(user.balance || 0);

          if (
            amountMinor === null ||
            !Number.isFinite(currentBalance) ||
            currentBalance < 0
          ) {
            throw new Error("INVALID_BALANCE");
          }

          const currentMinor = currency === "THB"
            ? Math.round(currentBalance * 100)
            : currentBalance;

          if (
            !Number.isSafeInteger(currentMinor) ||
            currentMinor < 0 ||
            (
              currency === "THB" &&
              Math.abs(currentBalance * 100 - currentMinor) > 0.000001
            )
          ) {
            throw new Error("INVALID_BALANCE");
          }

          const newMinor = currentMinor + amountMinor;

          if (!Number.isSafeInteger(newMinor)) {
            throw new Error("BALANCE_LIMIT");
          }

          const balanceBefore = fromMinor(currentMinor, currency);
          const balanceAfter = fromMinor(newMinor, currency);

          // Refund sender.
          transaction.update(userRef, {
            balance: balanceAfter,
            updatedAt: FieldValue.serverTimestamp()
          });

          // Mark request rejected.
          transaction.update(requestRef, {
            status: "rejected",
            rejectionReason: reason,
            reviewedBy: req.user.uid,
            reviewedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
            refundedAmount: transfer.sendAmount,
            refundedCurrency: currency
          });

          // Refund ledger.
          transaction.create(refundLedgerRef, {
            ledgerId: `international_${id}_REFUND`,
            uid: transfer.senderUid,
            direction: "credit",
            type: "international_transfer_refund",
            amount: transfer.sendAmount,
            currency,
            balanceBefore,
            balanceAfter,
            referenceId: id,
            status: "completed",
            createdAt: FieldValue.serverTimestamp()
          });

          return {
            alreadyProcessed: false,
            refundedAmount: transfer.sendAmount,
            currency,
            balanceAfter
          };
        });

        return res.json({
          success: true,
          message: result.alreadyProcessed
            ? "Transfer was already rejected and refunded."
            : "Transfer rejected and sender wallet refunded.",
          result
        });

      } catch (err) {
        console.error("REJECT INTERNATIONAL TRANSFER:", err);

        const messages = {
          TRANSFER_NOT_FOUND: [404, "Transfer not found."],
          TRANSFER_NOT_PENDING: [409, "Transfer is not pending."],
          USER_NOT_FOUND: [404, "Sender wallet not found."],
          REFUND_ALREADY_EXISTS: [409, "Refund ledger already exists."],
          CURRENCY_MISMATCH: [400, "Transfer currency mismatch."],
          INVALID_BALANCE: [400, "Wallet balance is invalid."],
          BALANCE_LIMIT: [400, "Wallet balance limit exceeded."]
        };

        const result = messages[err.message];

        return result
          ? error(res, result[0], result[1])
          : error(res, 500, "Unable to reject international transfer.");
      }
    }
  );

  return router;
}

module.exports = createDepositRoutes;
