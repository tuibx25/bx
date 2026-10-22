// /bx/bt/js/firebase-init.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged, sendEmailVerification, sendPasswordResetEmail,
  signInAnonymously
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
  getFirestore, collection, addDoc, getDocs, doc, deleteDoc,
  updateDoc, query, where, getDoc, setDoc, serverTimestamp, writeBatch,
  limit, orderBy, startAfter
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import {
  getFunctions, httpsCallable
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-functions.js";
// ⚠️ ĐÃ SỬA: Đổi sang ReCaptchaEnterpriseProvider
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app-check.js";

const firebaseConfig = {
  apiKey: "AIzaSyDX1tt6PyBUxCwU6qTe9Cn9bbbWhgLKLKU",
  authDomain: "bx-vlpt.firebaseapp.com",
  projectId: "bx-vlpt",
  storageBucket: "bx-vlpt.firebasestorage.app",
  messagingSenderId: "223423849238",
  appId: "1:223423849238:web:5407c3bc93d68654dc2637",
  measurementId: "G-S37RM7Q5C5"
};

// 1. Khởi tạo Firebase
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app);

// 2. Khởi tạo App Check (Dùng Enterprise)
const appCheck = initializeAppCheck(app, {
  // ⚠️ ĐÃ SỬA: Dùng ReCaptchaEnterpriseProvider
  provider: new ReCaptchaEnterpriseProvider('6LcZFfktAAAAADOJQgaH33dc5liMbbO90SqdMLfj'),
  isTokenAutoRefreshEnabled: true 
});

export const TEACHER_EMAIL = "trntui6@gmail.com";

// ==========================================
// XUẤT CÁC HÀM (DÀNH CHO TRANG CHỦ DÙNG IMPORT)
// ==========================================
export {
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged, sendEmailVerification, sendPasswordResetEmail,
  collection, addDoc, getDocs, doc, deleteDoc, updateDoc,
  query, where, getDoc, setDoc, serverTimestamp, writeBatch,
  limit, orderBy, startAfter, httpsCallable
};

// ==========================================
// GẮN HÀM VÀO WINDOW (DÀNH CHO CÁC TRANG CON: INDEX1, SELF_PRAC)
// ==========================================
window.getFirebaseQuestions = async function() {
  try {
      const querySnapshot = await getDocs(collection(db, "vl10_questions"));
      let questions = [];
      querySnapshot.forEach((doc) => { 
          let q = doc.data();
          q.uid = doc.id; // 🟢 QUAN TRỌNG: Gán ID của Firestore làm uid
          questions.push(q); 
      });
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
            // KIỂM TRA XÁC MINH EMAIL
            if (!user.emailVerified) {
                callback(false, "Tài khoản chưa được xác minh email. Vui lòng kiểm tra hộp thư!");
                signOut(auth);
                return;
            }
            const emailEl = document.getElementById('authUserEmail');
            if(emailEl) emailEl.textContent = user.email;
            callback(true);
        } else { callback(false); }
    });
};

window.logoutFirebase = function() {
    signOut(auth).then(() => location.reload());
};