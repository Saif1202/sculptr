// Import the functions you need from the SDKs you need
import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getFunctions, Functions } from 'firebase/functions';

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCr-CHSDPRqe8P3_foahgx9hNYdX-n9W5k",
  authDomain: "sculptr-a2104.firebaseapp.com",
  projectId: "sculptr-a2104",
  storageBucket: "sculptr-a2104.firebasestorage.app",
  messagingSenderId: "85088522219",
  appId: "1:85088522219:web:abe0e308171980335893ae",
  measurementId: "G-2H8G6BQZDT"
};

// Initialize Firebase (only if not already initialized)
let app: FirebaseApp;
if (getApps().length === 0) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApps()[0];
}

// Log project ID at startup (only in development)
if (__DEV__) {
  console.log('Firebase project:', app.options.projectId);
}

// Initialize Firebase services
// Note: Firebase Auth will use memory persistence by default in React Native
// For production, consider using a custom persistence solution or upgrading Firebase
// when React Native persistence support is officially available
export const auth: Auth = getAuth(app);
export const db: Firestore = getFirestore(app);
export const functions: Functions = getFunctions(app, 'europe-west2');

/*
 * Firestore Security Rules Example:
 * 
 * rules_version = '2';
 * service cloud.firestore {
 *   match /databases/{database}/documents {
 *     // Users can only read/write their own data
 *     match /users/{userId}/{document=**} {
 *       allow read, write: if request.auth != null && request.auth.uid == userId;
 *     }
 *     
 *     // Deny all other access by default
 *     match /{document=**} {
 *       allow read, write: if false;
 *     }
 *   }
 * }
 */

