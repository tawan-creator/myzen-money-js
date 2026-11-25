
// ==========================================
// ADMIN APPROVE USER
// POST /api/admin/users/:uid/approve
// ==========================================

app.post(
  "/api/admin/users/:uid/approve",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    try {
      const uid = String(
        req.params.uid || ""
      ).trim();

      if (!uid || uid.length > 128) {
        return sendError(
          res,
          400,
          "Invalid user UID."
        );
      }

      // Verify Firebase Authentication account
      let authUser;

      try {
        authUser = await firebaseAuth.getUser(uid);
      } catch (error) {
        if (error.code === "auth/user-not-found") {
          return sendError(
            res,
            404,
            "Firebase Authentication user not found."
          );
        }

        throw error;
      }

      // Find Firestore wallet profile
      const userRef = db
        .collection("users")
        .doc(uid);

      const userSnap = await userRef.get();

      if (!userSnap.exists) {
        return sendError(
          res,
          404,
          "User wallet profile not found. Register profile must be created first."
        );
      }

      const profile = userSnap.data();

      const currentStatus = String(
        profile.status || ""
      ).trim().toLowerCase();

      if (currentStatus === "approved") {
        return res.json({
          success: true,
          message: "This user is already approved.",
          uid,
          status: "approved"
        });
      }

      if (currentStatus !== "pending") {
        return sendError(
          res,
          400,
          "Only pending users can be approved."
        );
      }

      // Validate wallet country before approval
      const country = normalizeCountry(
        profile.country
      );

      if (!country) {
        return sendError(
          res,
          400,
          "User country is missing or invalid."
        );
      }

      const currency = getCurrency(country);

      // Validate existing balance
      const balance = balanceToMinorUnits(
        profile.balance ?? 0,
        currency
      );

      if (balance === null && Number(profile.balance ?? 0) !== 0) {
        return sendError(
          res,
          400,
          "User wallet balance is invalid."
        );
      }

      // Approve account
      await userRef.update({
        status: "approved",
        approvedAt: FieldValue.serverTimestamp(),
        approvedBy: req.user.uid,
        updatedAt: FieldValue.serverTimestamp()
      });

      console.log(
        "ADMIN APPROVED USER:",
        uid,
        "BY:",
        req.user.email
      );

      return res.json({
        success: true,
        message: "User approved successfully.",
        user: {
          uid,
          name: profile.name || authUser.displayName || "",
          email: profile.email || authUser.email || "",
          country,
          currency,
          status: "approved"
        }
      });

    } catch (error) {
      console.error(
        "ADMIN APPROVE USER ERROR:",
        error
      );

      return sendError(
        res,
        500,
        "Unable to approve user."
      );
    }
  }
);
