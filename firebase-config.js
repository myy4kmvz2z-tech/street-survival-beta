// STREET SURVIVAL β8.0 Firebase Config
// ここをFirebaseの「ウェブアプリ設定」からコピーした値に貼り替えてください。
// Firebase Console → Project settings → Your apps → Web app → firebaseConfig

window.STREET_SURVIVAL_FIREBASE_ENABLED = false;

window.STREET_SURVIVAL_FIREBASE_CONFIG = {
  apiKey: "PASTE_YOUR_API_KEY",
  authDomain: "PASTE_YOUR_PROJECT.firebaseapp.com",
  databaseURL: "https://PASTE_YOUR_PROJECT-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "PASTE_YOUR_PROJECT",
  storageBucket: "PASTE_YOUR_PROJECT.appspot.com",
  messagingSenderId: "PASTE_YOUR_SENDER_ID",
  appId: "PASTE_YOUR_APP_ID"
};

// true にするとFirebase通信を使います。
// 設定値を貼ったあと、下を true にしてください。
// window.STREET_SURVIVAL_FIREBASE_ENABLED = true;
