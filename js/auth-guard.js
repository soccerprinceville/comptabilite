// Protège une page : redirige vers l'accueil si non connecté,
// et vers dashboard.html si le rôle n'a pas accès (rolesAutorises).
// Renvoie une promesse résolue avec { uid, email, nom, role }.
function protegerPage(rolesAutorises) {
  return new Promise((resolve) => {
    auth.onAuthStateChanged(async (user) => {
      if (!user) {
        window.location.href = "index.html";
        return;
      }
      const doc = await db.collection("users").doc(user.uid).get();
      if (!doc.exists) {
        alert("Votre compte n'a pas encore de rôle assigné. Contactez un comptable.");
        auth.signOut();
        return;
      }
      const profil = { uid: user.uid, email: user.email, ...doc.data() };
      if (rolesAutorises && !rolesAutorises.includes(profil.role)) {
        window.location.href = "dashboard.html";
        return;
      }
      remplirEntete(profil);
      resolve(profil);
    });
  });
}

function remplirEntete(profil) {
  const elNom = document.getElementById("entete-utilisateur");
  if (elNom) {
    const roleLisible = profil.role === "comptable" ? "Comptable" : "Directeur";
    elNom.textContent = `${profil.nom || profil.email} · ${roleLisible}`;
  }
  const boutonDeco = document.getElementById("bouton-deconnexion");
  if (boutonDeco) {
    boutonDeco.addEventListener("click", () => auth.signOut().then(() => {
      window.location.href = "index.html";
    }));
  }
  // Masque les liens de menu réservés au comptable si l'utilisateur est directeur.
  if (profil.role !== "comptable") {
    document.querySelectorAll("[data-role-requise=comptable]").forEach(el => el.remove());
  }
}

function genererToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map(b => b.toString(16).padStart(2, "0")).join("");
}

function formaterDate(timestamp) {
  if (!timestamp) return "—";
  const d = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return d.toLocaleDateString("fr-CA");
}

function formaterMontant(montant) {
  return Number(montant).toLocaleString("fr-CA", { style: "currency", currency: "CAD" });
}

// Convertit un fichier <input type=file> en base64 pour l'envoyer à Apps Script.
function fichierEnBase64(fichier) {
  return new Promise((resolve, reject) => {
    const lecteur = new FileReader();
    lecteur.onload = () => resolve(lecteur.result.split(",")[1]);
    lecteur.onerror = reject;
    lecteur.readAsDataURL(fichier);
  });
}

// Appelle le "serveur" Apps Script. Content-Type text/plain volontaire :
// évite le préflight CORS (OPTIONS) qu'Apps Script ne gère pas.
async function appelerAppsScript(action, donnees) {
  const reponse = await fetch(APPS_SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action, ...donnees })
  });
  const resultat = await reponse.json();
  if (!resultat.ok) throw new Error(resultat.erreur || "Erreur du serveur Apps Script");
  return resultat;
}
