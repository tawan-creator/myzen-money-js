
const { setGlobalOptions } = require("firebase-functions/v2");
const {
  onCall,
  HttpsError
} = require("firebase-functions/v2/https");

const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

const { randomInt } = require("crypto");

initializeApp();

const db = getFirestore();

setGlobalOptions({
  maxInstances: 10,
  region: "asia-southeast1"
});

function requireApprovedUser(request) {
  if (!request.auth) {
    throw new HttpsError(
      "unauthenticated",
      "Please log in first."
    );
  }

  return request.auth.uid;
}

function normalizeCountry(value) {
  const country = String(value || "").trim().toLowerCase();

  if (["thailand", "th", "ไทย"].includes(country)) {
    return "Thailand";
  }

  if (["myanmar", "mm", "burma", "မြန်မာ"].includes(country)) {
    return "Myanmar";
  }

  return "";
}

async function getApprovedProfile(uid) {
  const ref = db.collection("users").doc(uid);
  const snap = await ref.get();

  if (!snap.exists) {
    throw new HttpsError(
      "not-found",
      "Wallet profile not found."
    );
  }

  const profile = snap.data();

  if (profile.status !== "approved") {
    throw new HttpsError(
      "failed-precondition",
      "This wallet is not approved."
    );
  }

  const country = normalizeCountry(profile.country);

  if (!country) {
    throw new HttpsError(
      "failed-precondition",
      "Wallet country is invalid."
    );
  }

  return {
    ref,
    profile,
    country
  };
}

/* =====================================
   CREATE OR GET UNIQUE RECEIVE CODE
===================================== */

exports.ensureReceiveCode = onCall(
  async (request) => {
    const uid = requireApprovedUser(request);

    const userRef = db.collection("users").doc(uid);

    for (let attempt = 0; attempt < 15; attempt++) {
      const newCode = String(
        randomInt(100000, 1000000)
      );

      const codeRef = db.collection("receiveCodes").doc(newCode);

      const result = await db.runTransaction(async (tx) => {
        const userSnap = await tx.get(userRef);

        if (!userSnap.exists) {
          throw new HttpsError(
            "not-found",
            "User profile not found."
          );
        }

        const profile = userSnap.data();

        if (profile.status !== "approved") {
          throw new HttpsError(
            "failed-precondition",
            "Your account is not approved."
          );
        }

        if (!normalizeCountry(profile.country)) {
          throw new HttpsError(
            "failed-precondition",
            "Your registered country is invalid."
          );
        }

        const existingCode = String(
          profile.receiveCode || ""
        );

        if (/^\d{6}$/.test(existingCode)) {
          const existingRef = db
            .collection("receiveCodes")
            .doc(existingCode);

          const existingSnap = await tx.get(existingRef);

          if (
            existingSnap.exists &&
            existingSnap.data().uid === uid
          ) {
            return existingCode;
          }

          if (!existingSnap.exists) {
            tx.create(existingRef, {
              uid,
              createdAt: new Date()
            });

            return existingCode;
          }

          throw new HttpsError(
            "already-exists",
            "Your existing receive code needs administrator review."
          );
        }

        const codeSnap = await tx.get(codeRef);

        if (codeSnap.exists) {
          return null;
        }

        tx.create(codeRef, {
          uid,
          createdAt: new Date()
        });

        tx.update(userRef, {
          receiveCode: newCode
        });

        return newCode;
      });

      if (result) {
        return {
          success: true,
          receiveCode: result
        };
      }
    }

    throw new HttpsError(
      "resource-exhausted",
      "Unable to create a unique code. Please try again."
    );
  }
);

/* =====================================
   LOOK UP WALLET USING 6 DIGIT CODE
===================================== */

exports.lookupReceiveCode = onCall(
  async (request) => {
    requireApprovedUser(request);

    const code = String(
      request.data?.code || ""
    ).trim();

    if (!/^\d{6}$/.test(code)) {
      throw new HttpsError(
        "invalid-argument",
        "Enter a valid 6-digit receive code."
      );
    }

    const codeSnap = await db
      .collection("receiveCodes")
      .doc(code)
      .get();

    if (!codeSnap.exists) {
      throw new HttpsError(
        "not-found",
        "Receive code not found."
      );
    }

    const uid = codeSnap.data().uid;

    if (!uid) {
      throw new HttpsError(
        "not-found",
        "Wallet not found."
      );
    }

    const wallet = await getApprovedProfile(uid);

    return {
      success: true,
      uid,
      name: wallet.profile.name || "MYZEN MONEY User",
      country: wallet.country
    };
  }
);

/* =====================================
   LOOK UP WALLET USING QR UID
===================================== */

exports.lookupWalletByUid = onCall(
  async (request) => {
    requireApprovedUser(request);

    const uid = String(
      request.data?.uid || ""
    ).trim();

    if (!uid || uid.length > 128) {
      throw new HttpsError(
        "invalid-argument",
        "Invalid wallet QR code."
      );
    }

    const wallet = await getApprovedProfile(uid);

    return {
      success: true,
      uid,
      name: wallet.profile.name || "MYZEN MONEY User",
      country: wallet.country
    };
  }
);
