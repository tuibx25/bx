import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged, sendEmailVerification, sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  getFirestore, collection, addDoc, getDocs, doc, deleteDoc,
  updateDoc, query, where, getDoc, setDoc, serverTimestamp, writeBatch
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
  getFunctions, httpsCallable
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js";

const firebaseConfig = {
  apiKey: "AIzaSyDh0fxRRsxEX8BGkzJv-TOxujDS9Md7aDo",
  authDomain: "vlpt-bx.firebaseapp.com",
  projectId: "vlpt-bx",
  storageBucket: "vlpt-bx.firebasestorage.app",
  messagingSenderId: "431143022843",
  appId: "1:431143022843:web:6d674d4db184d232f7005e",
  measurementId: "G-ZQVK5KZ565"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app);
export const TEACHER_EMAIL = "trntui6@gmail.com";

export {
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged, sendEmailVerification, sendPasswordResetEmail,
  collection, addDoc, getDocs, doc, deleteDoc, updateDoc,
  query, where, getDoc, setDoc, serverTimestamp, writeBatch,
  httpsCallable
};