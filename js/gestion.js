protegerPage(["comptable"]).then(() => {
  chargerComptes();
  chargerSoldes();
  chargerPersonnes();
  chargerCategories();
  chargerDestinataires();
});

// --- Comptes ---

async function chargerComptes() {
  const liste = document.getElementById("liste-comptes");
  const selectSolde = document.getElementById("solde-compte");
  liste.innerHTML = "";
  selectSolde.innerHTML = "";

  const snap = await db.collection("comptes").where("actif", "==", true).orderBy("nom").get();
  if (snap.empty) {
    liste.innerHTML = "<li class='aide'>Aucun compte. Ajoutez-en au moins un (ex. Compte courant).</li>";
    return;
  }
  snap.forEach((doc) => {
    const li = document.createElement("li");
    li.innerHTML = `<div class="infos">${doc.data().nom}</div><button class="bouton secondaire" data-retirer="${doc.id}">Retirer</button>`;
    liste.appendChild(li);

    const option = document.createElement("option");
    option.value = doc.id;
    option.textContent = doc.data().nom;
    selectSolde.appendChild(option);
  });
  liste.querySelectorAll("[data-retirer]").forEach((b) => {
    b.addEventListener("click", () => db.collection("comptes").doc(b.dataset.retirer).update({ actif: false }).then(chargerComptes));
  });
}

document.getElementById("form-compte").addEventListener("submit", async (e) => {
  e.preventDefault();
  const champ = document.getElementById("compte-nom");
  const nom = champ.value.trim();
  if (!nom) return;
  await db.collection("comptes").add({ nom, actif: true });
  champ.value = "";
  chargerComptes();
});

// --- Soldes initiaux (par compte + année) ---

async function chargerSoldes() {
  const liste = document.getElementById("liste-soldes");
  liste.innerHTML = "";
  const snap = await db.collection("soldesInitiaux").get();
  if (snap.empty) {
    liste.innerHTML = "<li class='aide'>Aucun solde initial défini pour l'instant.</li>";
    return;
  }
  const comptesSnap = await db.collection("comptes").get();
  const nomsComptes = {};
  comptesSnap.forEach(c => nomsComptes[c.id] = c.data().nom);

  const docs = snap.docs.sort((a, b) => (b.data().annee || 0) - (a.data().annee || 0));
  docs.forEach((doc) => {
    const d = doc.data();
    const nomCompte = nomsComptes[d.compteId] || "(compte supprimé)";
    const li = document.createElement("li");
    li.innerHTML = `<div class="infos">${nomCompte} — ${d.annee}<small>Solde initial : ${formaterMontant(d.soldeInitial)}</small></div>`;
    liste.appendChild(li);
  });
}

document.getElementById("form-solde").addEventListener("submit", async (e) => {
  e.preventDefault();
  const bouton = document.getElementById("solde-bouton");
  const erreurEl = document.getElementById("solde-erreur");
  erreurEl.style.display = "none";

  const compteId = document.getElementById("solde-compte").value;
  const annee = parseInt(document.getElementById("solde-annee").value, 10);
  const montant = parseFloat(document.getElementById("solde-montant").value);

  if (!compteId || !annee || isNaN(montant)) {
    erreurEl.textContent = "Remplissez tous les champs correctement.";
    erreurEl.style.display = "block";
    return;
  }

  bouton.disabled = true;
  try {
    await db.collection("soldesInitiaux").doc(`${compteId}_${annee}`).set({
      compteId, annee, soldeInitial: montant
    });
    document.getElementById("form-solde").reset();
    chargerSoldes();
  } finally {
    bouton.disabled = false;
  }
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
    const infosSpecimen = p.specimenChequeUrl
      ? `<a href="${p.specimenChequeUrl}" target="_blank" rel="noopener">Voir le spécimen de chèque</a>`
      : "Aucun spécimen";
    li.innerHTML = `
      <div class="infos">
        ${p.nom}
        <small>${infosSpecimen}</small>
      </div>
      <div>
        <button class="bouton secondaire" data-ajouter-specimen="${doc.id}" data-nom="${p.nom}">${p.specimenChequeFileId ? "Modifier le spécimen" : "Ajouter le spécimen"}</button>
        <button class="bouton secondaire" data-retirer="${doc.id}">Retirer</button>
      </div>
    `;
    liste.appendChild(li);
  });
  liste.querySelectorAll("[data-retirer]").forEach((b) => {
    b.addEventListener("click", () => db.collection("personnes").doc(b.dataset.retirer).update({ actif: false }).then(chargerPersonnes));
  });
  liste.querySelectorAll("[data-ajouter-specimen]").forEach((b) => {
    b.addEventListener("click", () => ouvrirModaleSpecimen(b.dataset.ajouterSpecimen, b.dataset.nom));
  });
}

// Vérifie s'il existe déjà une personne avec ce nom (peu importe la casse/les espaces).
async function personneExisteDeja(nom) {
  const snap = await db.collection("personnes").get();
  const nomNormalise = nom.trim().toLowerCase();
  return snap.docs.some(d => (d.data().nom || "").trim().toLowerCase() === nomNormalise);
}

document.getElementById("form-personne").addEventListener("submit", async (e) => {
  e.preventDefault();
  const bouton = document.getElementById("personne-bouton");
  const erreurEl = document.getElementById("personne-erreur");
  erreurEl.style.display = "none";
  const nom = document.getElementById("personne-nom").value.trim();
  const fichier = document.getElementById("personne-specimen").files[0];
  const lien = document.getElementById("personne-specimen-lien").value.trim();
  if (!nom) return;

  bouton.disabled = true;
  bouton.textContent = "Vérification…";

  try {
    if (await personneExisteDeja(nom)) {
      throw new Error(`« ${nom} » existe déjà dans la liste des personnes à rembourser.`);
    }

    let specimenChequeFileId = null;
    let specimenChequeUrl = null;

    if (fichier) {
      bouton.textContent = "Envoi du fichier…";
      const base64 = await fichierEnBase64(fichier);
      const resultat = await appelerAppsScript("uploadFichier", {
        dossier: "specimens",
        nomFichier: `${nom} - specimen cheque - ${fichier.name}`,
        mimeType: fichier.type,
        contenuBase64: base64
      });
      specimenChequeFileId = resultat.fileId;
      specimenChequeUrl = resultat.url;
    } else if (lien) {
      const fileId = extraireIdDrive(lien);
      if (!fileId) throw new Error("Le lien Google Drive fourni ne semble pas valide.");
      const resultat = await appelerAppsScript("lierFichierExistant", { fileId });
      specimenChequeFileId = resultat.fileId;
      specimenChequeUrl = resultat.url;
    }

    await db.collection("personnes").add({
      nom,
      specimenChequeFileId,
      specimenChequeUrl,
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

// --- Ajouter un spécimen plus tard à une personne existante ---

let personneSpecimenId = null;

function ouvrirModaleSpecimen(id, nom) {
  personneSpecimenId = id;
  document.getElementById("modale-specimen-nom").textContent = `Personne : ${nom}`;
  document.getElementById("modale-specimen-fichier").value = "";
  document.getElementById("modale-specimen-lien").value = "";
  document.getElementById("modale-specimen-erreur").style.display = "none";
  document.getElementById("modale-specimen").style.display = "flex";
}

document.getElementById("modale-specimen-annuler").addEventListener("click", () => {
  document.getElementById("modale-specimen").style.display = "none";
});

document.getElementById("modale-specimen-confirmer").addEventListener("click", async () => {
  const bouton = document.getElementById("modale-specimen-confirmer");
  const erreurEl = document.getElementById("modale-specimen-erreur");
  erreurEl.style.display = "none";
  const fichier = document.getElementById("modale-specimen-fichier").files[0];
  const lien = document.getElementById("modale-specimen-lien").value.trim();

  if (!fichier && !lien) {
    erreurEl.textContent = "Choisissez un fichier ou collez un lien.";
    erreurEl.style.display = "block";
    return;
  }

  bouton.disabled = true;
  bouton.textContent = "Enregistrement…";

  try {
    let specimenChequeFileId, specimenChequeUrl;
    if (fichier) {
      const base64 = await fichierEnBase64(fichier);
      const resultat = await appelerAppsScript("uploadFichier", {
        dossier: "specimens",
        nomFichier: `specimen cheque - ${fichier.name}`,
        mimeType: fichier.type,
        contenuBase64: base64
      });
      specimenChequeFileId = resultat.fileId;
      specimenChequeUrl = resultat.url;
    } else {
      const fileId = extraireIdDrive(lien);
      if (!fileId) throw new Error("Le lien Google Drive fourni ne semble pas valide.");
      const resultat = await appelerAppsScript("lierFichierExistant", { fileId });
      specimenChequeFileId = resultat.fileId;
      specimenChequeUrl = resultat.url;
    }

    await db.collection("personnes").doc(personneSpecimenId).update({ specimenChequeFileId, specimenChequeUrl });
    document.getElementById("modale-specimen").style.display = "none";
    chargerPersonnes();
  } catch (err) {
    erreurEl.textContent = "Erreur : " + err.message;
    erreurEl.style.display = "block";
  } finally {
    bouton.disabled = false;
    bouton.textContent = "Enregistrer";
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
