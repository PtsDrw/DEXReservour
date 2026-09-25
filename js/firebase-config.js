import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore, collection, doc, addDoc, updateDoc, deleteDoc,
  getDocs, getDoc, setDoc, query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyD1ce06Jk_NaXkYxSzPyHqZo4Q28VC13ko",
  authDomain: "dexreservour.firebaseapp.com",
  projectId: "dexreservour",
  storageBucket: "dexreservour.firebasestorage.app",
  messagingSenderId: "402820645234",
  appId: "1:402820645234:web:8d52c4f50bfba6284c9deb"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export {
  collection, doc, addDoc, updateDoc, deleteDoc,
  getDocs, getDoc, setDoc, query, orderBy, serverTimestamp
};


import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

export const auth = getAuth(app);

// Функция анонимного входа
export function ensureAnonymousAuth() {
  return new Promise((resolve) => {
    onAuthStateChanged(auth, (user) => {
      if (user) {
        resolve(user);
      } else {
        signInAnonymously(auth)
          .then((cred) => resolve(cred.user))
          .catch((err) => {
            console.error('Ошибка анонимного входа:', err);
            resolve(null);
          });
      }
    });
  });
}