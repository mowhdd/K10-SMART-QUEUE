import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

import {
  getFirestore,
  collection,
  addDoc,
  onSnapshot,
  doc,
  updateDoc,
  query,
  orderBy,
  serverTimestamp,
  runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDVwdrl6SD70Lg2hLtBBDLmDQxlSB2vqww",
  authDomain: "smart-queue-management-s-aa0cc.firebaseapp.com",
  projectId: "smart-queue-management-s-aa0cc",
  storageBucket: "smart-queue-management-s-aa0cc.firebasestorage.app",
  messagingSenderId: "51333907626",
  appId: "1:51333907626:web:149c7a46c2267281fc7cd3",
  measurementId: "G-ZC491ZTRLT"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export {
  db,
  collection,
  addDoc,
  onSnapshot,
  doc,
  updateDoc,
  query,
  orderBy,
  serverTimestamp,
  runTransaction
};
