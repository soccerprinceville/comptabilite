let profilActuel = null;

protegerPage(["comptable", "directeur"]).then((profil) => {
  profilActuel = profil;
  chargerComptes();
  chargerPersonnes();
});

async function chargerComptes() {
  const select = document.getElementById("compte");
  const snap = await db.collection("comptes").where("actif", "==", true).orderBy("nom").get();
  snap.forEach((doc) => {
    const option = document.createElement("option");
    option.value = doc.id;
    option.textContent = doc.data().nom;
    select.appendChild(option);
  });
}

async function chargerPersonnes() {
  const select = document.getElementById("personne");
  const snap = await db.collection("personnes").where("actif", "==", true).orderBy("nom").get();
  snap.forEach((doc) => {
    const option = document.createElement("option");
    option.value = doc.id;
    option.textContent = doc.data().nom;
    select.appendChild(option);
  });
}

document.getElementById("form-demande").addEventListener("submit", async (e) => {
  e.preventDefault();
  const bouton = document.getElementById("bouton-envoyer");
  const erreurEl = document.getElementById("message-erreur");
  const succesEl = document.getElementById("message-succes");
  erreurEl.style.display = "none";
  succesEl.style.display = "none";

  const selectCompte = document.getElementById("compte");
  const compteId = selectCompte.value;
  const selectPersonne = document.getElementById("personne");
  const personneId = selectPersonne.value;
  const personneNom = selectPersonne.selectedOptions[0]?.textContent || "";
  const montant = parseFloat(document.getElementById("montant").value);
  const fichier = document.getElementById("piece-jointe").files[0];

  if (!compteId || !personneId || !montant || !fichier) return;

  bouton.disabled = true;
  bouton.textContent = "Envoi en cours…";

  try {
    const base64 = await fichierEnBase64(fichier);
    const resultatUpload = await appelerAppsScript("uploadFichier", {
      dossier: "demandes",
      nomFichier: `${personneNom} - ${new Date().toISOString().slice(0,10)} - ${fichier.name}`,
      mimeType: fichier.type,
      contenuBase64: base64
    });

    await db.collection("demandes").add({
      compteId,
      annee: new Date().getFullYear(),
      ordre: Date.now(),
      personneId,
      personneNom,
      montant,
      categorie: null,
      pieceJointeFileId: resultatUpload.fileId,
      pieceJointeUrl: resultatUpload.url,
      statut: "en_attente",
      creePar: profilActuel.uid,
      creeParNom: profilActuel.nom || profilActuel.email,
      dateCreation: firebase.firestore.FieldValue.serverTimestamp(),
      approuvePar: null,
      approuveParNom: null,
      dateApprobation: null,
      datePaiement: null,
      token: genererToken()
    });

    succesEl.style.display = "block";
    e.target.reset();
  } catch (err) {
    erreurEl.textContent = "Erreur : " + err.message;
    erreurEl.style.display = "block";
  } finally {
    bouton.disabled = false;
    bouton.textContent = "Envoyer la demande";
  }
});
