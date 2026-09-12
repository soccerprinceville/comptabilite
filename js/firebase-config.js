// ============================================================
// À COMPLÉTER : voir README.md, section "1. Créer le projet Firebase"
// ============================================================

// Collez ici l'objet firebaseConfig fourni par la console Firebase
// (Paramètres du projet > Vos applications > Config).
const firebaseConfig = {
  apiKey: "AIzaSyAoXdDlzZpJn2dn6lKcU2lJqQ6JY95K0VA",
  authDomain: "comptabilite-af37c.firebaseapp.com",
  projectId: "comptabilite-af37c",
  storageBucket: "comptabilite-af37c.firebasestorage.app",
  messagingSenderId: "1000752996114",
  appId: "1:1000752996114:web:9e84ed98332be450599dcb"
};

// URL du déploiement Apps Script (se termine par /exec).
// Voir README.md, section "3. Déployer le serveur Google Apps Script".
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxA7ehAS2dNUGJFYC8wsykbS7uOEfaEj82Xrrp-v0zVAh37HUjiTEnEraoPkl_UrGO2/exec";

// URL de votre site publié sur GitHub Pages (utilisée pour construire le lien
// de confirmation de paiement envoyé par courriel).
const SITE_URL = "https://soccerprinceville.github.io/comptabilite/";

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
