protegerPage(["comptable"]).then(() => {
  chargerSoldeInitial();
  chargerPersonnes();
  chargerCategories();
  chargerDestinataires();
});

// --- Solde initial du compte ---

async function chargerSoldeInitial() {
  const doc = await db.collection("parametres").doc("general").get();
  const champ = document.getElementById("solde-initial");
  champ.value = doc.exists && typeof doc.data().soldeInitial === "number" ? doc.data().soldeInitial : 0;
}

document.getElementById("solde-bouton").addEventListener("click", async () => {
  const champ = document.getElementById("solde-initial");
  const erreurEl = document.getElementById("solde-erreur");
  erreurEl.style.display = "none";
  const valeur = parseFloat(champ.value);
  if (isNaN(valeur)) {
    erreurEl.textContent = "Entrez un montant valide.";
    erreurEl.style.display = "block";
    return;
  }
  await db.collection("parametres").doc("general").set({ soldeInitial: valeur }, { merge: true });
});

// --- Personnes à rembourser ---

async function chargerPersonnes() {
  const liste = document.getElementById("liste-personnes");
  liste.innerHTML = "";
  const snap = await db.collection("personnes").where("actif", "==", true).orderBy("nom").get();
  if (snap.empty) {
    liste.innerHTML = "<li class='aide'>Aucune personne ajoutée.</li>";
    return;
  }
  snap.forEach((doc) => {
    const p = doc.data();
    const li = document.createElement("li");
    li.innerHTML = `
      <div class="infos">
        ${p.nom}
        <small>${p.specimenChequeUrl ? `<a href="${p.specimenChequeUrl}" target="_blank" rel="noopener">Voir le spécimen de chèque</a>` : "Aucun spécimen"}</small>
      </div>
      <button class="bouton secondaire" data-retirer="${doc.id}">Retirer</button>
    `;
    liste.appendChild(li);
  });
  liste.querySelectorAll("[data-retirer]").forEach((b) => {
    b.addEventListener("click", () => db.collection("personnes").doc(b.dataset.retirer).update({ actif: false }).then(chargerPersonnes));
  });
}

document.getElementById("form-personne").addEventListener("submit", async (e) => {
  e.preventDefault();
  const bouton = document.getElementById("personne-bouton");
  const erreurEl = document.getElementById("personne-erreur");
  erreurEl.style.display = "none";
  const nom = document.getElementById("personne-nom").value.trim();
  const fichier = document.getElementById("personne-specimen").files[0];
  if (!nom || !fichier) return;

  bouton.disabled = true;
  bouton.textContent = "Ajout en cours…";
  try {
    const base64 = await fichierEnBase64(fichier);
    const resultat = await appelerAppsScript("uploadFichier", {
      dossier: "specimens",
      nomFichier: `${nom} - specimen cheque - ${fichier.name}`,
      mimeType: fichier.type,
      contenuBase64: base64
    });
    await db.collection("personnes").add({
      nom,
      specimenChequeFileId: resultat.fileId,
      specimenChequeUrl: resultat.url,
      actif: true,
      dateAjout: firebase.firestore.FieldValue.serverTimestamp()
    });
    e.target.reset();
    chargerPersonnes();
  } catch (err) {
    erreurEl.textContent = "Erreur : " + err.message;
    erreurEl.style.display = "block";
  } finally {
    bouton.disabled = false;
    bouton.textContent = "Ajouter";
  }
});

// --- Catégories ---

async function chargerCategories() {
  const liste = document.getElementById("liste-categories");
  liste.innerHTML = "";
  const snap = await db.collection("categories").where("actif", "==", true).orderBy("nom").get();
  if (snap.empty) {
    liste.innerHTML = "<li class='aide'>Aucune catégorie. Ajoutez-en au moins une avant d'approuver des demandes.</li>";
    return;
  }
  snap.forEach((doc) => {
    const li = document.createElement("li");
    li.innerHTML = `<div class="infos">${doc.data().nom}</div><button class="bouton secondaire" data-retirer="${doc.id}">Retirer</button>`;
    liste.appendChild(li);
  });
  liste.querySelectorAll("[data-retirer]").forEach((b) => {
    b.addEventListener("click", () => db.collection("categories").doc(b.dataset.retirer).update({ actif: false }).then(chargerCategories));
  });
}

document.getElementById("form-categorie").addEventListener("submit", async (e) => {
  e.preventDefault();
  const champ = document.getElementById("categorie-nom");
  const nom = champ.value.trim();
  if (!nom) return;
  await db.collection("categories").add({ nom, actif: true });
  champ.value = "";
  chargerCategories();
});

// --- Destinataires du courriel ---

async function chargerDestinataires() {
  const liste = document.getElementById("liste-destinataires");
  liste.innerHTML = "";
  const snap = await db.collection("destinataires").where("actif", "==", true).orderBy("nom").get();
  if (snap.empty) {
    liste.innerHTML = "<li class='aide'>Aucun destinataire. Le courriel d'approbation ne pourra pas être envoyé tant qu'il n'y en a pas au moins un.</li>";
    return;
  }
  snap.forEach((doc) => {
    const d = doc.data();
    const li = document.createElement("li");
    li.innerHTML = `<div class="infos">${d.nom}<small>${d.email}</small></div><button class="bouton secondaire" data-retirer="${doc.id}">Retirer</button>`;
    liste.appendChild(li);
  });
  liste.querySelectorAll("[data-retirer]").forEach((b) => {
    b.addEventListener("click", () => db.collection("destinataires").doc(b.dataset.retirer).update({ actif: false }).then(chargerDestinataires));
  });
}

document.getElementById("form-destinataire").addEventListener("submit", async (e) => {
  e.preventDefault();
  const nomChamp = document.getElementById("destinataire-nom");
  const courrielChamp = document.getElementById("destinataire-courriel");
  const nom = nomChamp.value.trim();
  const email = courrielChamp.value.trim();
  if (!nom || !email) return;
  await db.collection("destinataires").add({ nom, email, actif: true });
  nomChamp.value = "";
  courrielChamp.value = "";
  chargerDestinataires();
});
