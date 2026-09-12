let profilActuel = null;
let demandeSelectionnee = null;

protegerPage(["comptable"]).then((profil) => {
  profilActuel = profil;
  chargerDemandes();
});

async function obtenirSoldeInitial() {
  const doc = await db.collection("parametres").doc("general").get();
  return doc.exists && typeof doc.data().soldeInitial === "number" ? doc.data().soldeInitial : 0;
}

async function chargerDemandes() {
  const corps = document.getElementById("corps-tableau");
  const messageVide = document.getElementById("message-vide");
  corps.innerHTML = "";

  const soldeInitial = await obtenirSoldeInitial();
  document.getElementById("ligne-solde-initial").textContent =
    `Solde initial du compte : ${formaterMontant(soldeInitial)} (modifiable dans Gestion). Chaque demande, même en attente, est déduite du solde ci-dessous.`;

  // Ordre chronologique (la plus ancienne en premier) pour que le solde
  // se lise naturellement de ligne en ligne, comme un relevé bancaire.
  const snap = await db.collection("demandes").orderBy("dateCreation", "asc").get();

  if (snap.empty) {
    messageVide.style.display = "block";
    return;
  }
  messageVide.style.display = "none";

  let solde = soldeInitial;

  snap.forEach((doc) => {
    const d = doc.data();
    solde -= Number(d.montant) || 0;
    const soldeNegatif = solde < 0;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${formaterDate(d.dateCreation)}</td>
      <td>${d.personneNom}</td>
      <td class="mono">${formaterMontant(d.montant)}</td>
      <td class="mono" style="${soldeNegatif ? "color:var(--rouge);font-weight:600;" : ""}">${formaterMontant(solde)}</td>
      <td>${d.categorie || "—"}</td>
      <td><span class="badge ${d.statut}">${libelleStatut(d.statut)}</span></td>
      <td><a href="${d.pieceJointeUrl}" target="_blank" rel="noopener">Voir</a></td>
      <td>${d.statut === "en_attente" ? `<button class="bouton" data-id="${doc.id}">Approuver</button>` : ""}</td>
    `;
    corps.appendChild(tr);
  });

  corps.querySelectorAll("button[data-id]").forEach((bouton) => {
    bouton.addEventListener("click", () => ouvrirModaleApprobation(bouton.dataset.id));
  });
}

function libelleStatut(statut) {
  return { en_attente: "En attente", en_cours_paiement: "En cours de paiement", payee: "Payée" }[statut] || statut;
}

async function ouvrirModaleApprobation(demandeId) {
  const doc = await db.collection("demandes").doc(demandeId).get();
  demandeSelectionnee = { id: doc.id, ...doc.data() };

  document.getElementById("modale-resume").textContent =
    `${demandeSelectionnee.personneNom} — ${formaterMontant(demandeSelectionnee.montant)}`;

  const personneDoc = await db.collection("personnes").doc(demandeSelectionnee.personneId).get();
  const personne = personneDoc.data();
  const alerteEl = document.getElementById("modale-alerte-specimen");
  const boutonConfirmer = document.getElementById("modale-confirmer");

  if (!personne || !personne.specimenChequeFileId) {
    alerteEl.textContent = "⚠ Cette personne n'a pas de spécimen de chèque rattaché. Ajoutez-le dans Gestion avant d'approuver.";
    alerteEl.style.display = "block";
    boutonConfirmer.disabled = true;
  } else {
    alerteEl.style.display = "none";
    boutonConfirmer.disabled = false;
  }
  demandeSelectionnee.personne = personne;

  const selectCategorie = document.getElementById("modale-categorie");
  selectCategorie.innerHTML = "";
  const snapCategories = await db.collection("categories").where("actif", "==", true).orderBy("nom").get();
  snapCategories.forEach((c) => {
    const option = document.createElement("option");
    option.value = c.data().nom;
    option.textContent = c.data().nom;
    selectCategorie.appendChild(option);
  });

  document.getElementById("modale-erreur").style.display = "none";
  document.getElementById("modale-approbation").style.display = "flex";
}

document.getElementById("modale-annuler").addEventListener("click", () => {
  document.getElementById("modale-approbation").style.display = "none";
});

document.getElementById("modale-confirmer").addEventListener("click", async () => {
  const bouton = document.getElementById("modale-confirmer");
  const erreurEl = document.getElementById("modale-erreur");
  const categorie = document.getElementById("modale-categorie").value;
  if (!categorie) return;

  bouton.disabled = true;
  bouton.textContent = "Envoi en cours…";

  try {
    const snapDestinataires = await db.collection("destinataires").where("actif", "==", true).get();
    const destinataires = snapDestinataires.docs.map(d => d.data().email);
    if (destinataires.length === 0) {
      throw new Error("Aucun destinataire configuré (menu Gestion).");
    }

    await db.collection("demandes").doc(demandeSelectionnee.id).update({
      categorie,
      statut: "en_cours_paiement",
      approuvePar: profilActuel.uid,
      approuveParNom: profilActuel.nom || profilActuel.email,
      dateApprobation: firebase.firestore.FieldValue.serverTimestamp()
    });

    const lienConfirmation = `${SITE_URL}confirmation.html?id=${demandeSelectionnee.id}&token=${demandeSelectionnee.token}`;

    await appelerAppsScript("envoyerCourriel", {
      destinataires,
      personneNom: demandeSelectionnee.personneNom,
      montant: demandeSelectionnee.montant,
      categorie,
      pieceJointeFileId: demandeSelectionnee.pieceJointeFileId,
      specimenChequeFileId: demandeSelectionnee.personne.specimenChequeFileId,
      lienConfirmation
    });

    document.getElementById("modale-approbation").style.display = "none";
    chargerDemandes();
  } catch (err) {
    erreurEl.textContent = "Erreur : " + err.message;
    erreurEl.style.display = "block";
  } finally {
    bouton.disabled = false;
    bouton.textContent = "Approuver et envoyer le courriel";
  }
});
