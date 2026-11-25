
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {

    function signedIn() {
      return request.auth != null;
    }

    function isAdmin() {
      return signedIn()
        && request.auth.token.email == "tharwaiphyol@gmail.com"
        && request.auth.token.email_verified == true;
    }

    // User Accounts
    match /users/{userId} {

      // User ကိုယ်တိုင် Pending Account ဖန်တီးနိုင်သည်
      allow create: if signedIn()
        && request.auth.uid == userId
        && request.resource.data.uid == userId
        && request.resource.data.email == request.auth.token.email
        && request.resource.data.status == "pending"
        && request.resource.data.balance == 0;

      // ကိုယ့် Account ကိုယ်ကြည့်နိုင်ပြီး Admin က အားလုံးကြည့်နိုင်သည်
      allow read: if signedIn()
        && (request.auth.uid == userId || isAdmin());

      // Admin သာ Account နှင့် Balance ပြင်နိုင်သည်
      allow update, delete: if isAdmin();
    }

    // Deposit and Transfer Requests
    match /paymentRequests/{requestId} {

      allow create: if signedIn()
        && request.resource.data.uid == request.auth.uid
        && request.resource.data.type in ["deposit", "transfer"]
        && request.resource.data.amount is number
        && request.resource.data.amount > 0
        && request.resource.data.status == "pending";

      allow read: if signedIn()
        && (resource.data.uid == request.auth.uid || isAdmin());

      allow update, delete: if isAdmin();
    }

    // Transaction History
    match /transactions/{transactionId} {

      allow read: if signedIn()
        && (resource.data.uid == request.auth.uid || isAdmin());

      allow create, update, delete: if isAdmin();
    }

    // Other collections are blocked
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
