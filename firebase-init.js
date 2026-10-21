// firebase-init.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { initializeAppCheck, ReCaptchaV3Provider } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app-check.js";

// Cấu hình Firebase
const firebaseConfig = {
  apiKey: "AIzaSyDX1tt6PyBUxCwU6qTe9Cn9bbbWhgLKLKU",
  authDomain: "bx-vlpt.firebaseapp.com",
  projectId: "bx-vlpt",
  storageBucket: "bx-vlpt.firebasestorage.app",
  messagingSenderId: "223423849238",
  appId: "1:223423849238:web:5407c3bc93d68654dc2637",
  measurementId: "G-S37RM7Q5C5"
};

// Khởi tạo Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Khởi tạo App Check
const appCheck = initializeAppCheck(app, {
  provider: new ReCaptchaV3Provider('6LcZFfktAAAAADOJQgaH33dc5liMbbO90SqdMLfj'),
  isTokenAutoRefreshEnabled: true 
});

// ==========================================
// CÁC HÀM DÙNG CHUNG (Gắn vào window để HTML gọi được)
// ==========================================

// Dành cho prac.html (Tài khoản ẩn danh)
window.getFirebaseQuestions = async function() {
  try {
      const querySnapshot = await getDocs(collection(db, "vl10_questions"));
      let questions = [];
      querySnapshot.forEach((doc) => { questions.push(doc.data()); });
      return questions;
  } catch(e) { 
      console.error("Lỗi lấy câu hỏi:", e);
      throw e; 
  }
};

window.initAnonymousAuth = function(callback) {
  onAuthStateChanged(auth, (user) => {
      if (user) {
          callback(true);
      } else {
          signInAnonymously(auth)
              .then(() => callback(true))
              .catch((error) => {
                  console.error("Lỗi đăng nhập ẩn danh:", error);
                  callback(false);
              });
      }
  });
};

// Dành cho index1.html (Đăng nhập Email/Password)
window.loginFirebase = async function(email, password) {
  try {
      await signInWithEmailAndPassword(auth, email, password);
      return { success: true };
  } catch (e) {
      return { success: false, message: "Sai email hoặc mật khẩu!" };
  }
};

window.checkAuthState = function(callback) {
    onAuthStateChanged(auth, (user) => {
        if (user) {
            if (!user.emailVerified) {
                callback(false, "Tài khoản chưa được xác minh email. Vui lòng kiểm tra hộp thư!");
                signOut(auth);
                return;
            }
            document.getElementById('authUserEmail').textContent = user.email;
            callback(true);
        } else { callback(false); }
    });
};

window.logoutFirebase = function() {
    signOut(auth).then(() => location.reload());
};