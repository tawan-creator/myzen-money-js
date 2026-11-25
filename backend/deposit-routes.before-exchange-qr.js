
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

function createDepositRoutes({
  db,
  FieldValue,
  requireAuth
}) {
  const router = express.Router();

  const settingsRef = db
    .collection("depositSettings")
    .doc("paymentMethods");

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

        if (!userSnap.exists ||
            userSnap.data().status !== "approved") {
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
              instructions: m.instructions || ""
            }))
        });

      } catch (err) {
        console.error("DEPOSIT METHODS:", err);
        return error(res, 500, "Unable to load payment methods.");
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

        // Upload as an authenticated Cloudinary asset.
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
          return error(res, 409, "This transaction reference was already submitted.");
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
            return error(res, 400, "Invalid payment method configuration.");
          }

          ids.add(id);

          clean.push({
            id,
            country,
            currency,
            name,
            accountName,
            accountNumber,
            instructions,
            bank,
            enabled: method.enabled === true
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

  return router;
}

module.exports = createDepositRoutes;
