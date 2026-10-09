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
  apiKey: "AIzaSyDX1tt6PyBUxCwU6qTe9Cn9bbbWhgLKLKU",
  authDomain: "bx-vlpt.firebaseapp.com",
  projectId: "bx-vlpt",
  storageBucket: "bx-vlpt.firebasestorage.app",
  messagingSenderId: "223423849238",
  appId: "1:223423849238:web:5407c3bc93d68654dc2637",
  measurementId: "G-S37RM7Q5C5"
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