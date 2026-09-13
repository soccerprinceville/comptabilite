let profilActuel = null;
let demandeSelectionnee = null;
let transactionSelectionneeId = null;
let listeActuelle = []; // liste combinée demandes + transactions affichées
let indexGlisse = null;

protegerPage(["comptable"]).then((profil) => {
  profilActuel = profil;
  initialiser();
});

async function initialiser() {
  await chargerComptesFiltre();
  chargerAnneesFiltre();
  chargerCategoriesTransaction();
  document.getElementById("filtre-compte").addEventListener("change", () => { chargerAnneesFiltre(); chargerListe(); });
  document.getElementById("filtre-annee").addEventListener("change", chargerListe);
  chargerListe();
}

async function chargerComptesFiltre() {
  const select = document.getElementById("filtre-compte");
  const snap = await db.collection("comptes").where("actif", "==", true).orderBy("nom").get();
  select.innerHTML = "";
  snap.forEach((doc) => {
    const option = document.createElement("option");
    option.value = doc.id;
    option.textContent = doc.data().nom;
    select.appendChild(option);
  });
}

function chargerAnneesFiltre() {
  const select = document.getElementById("filtre-annee");
  const anneeActuelle = new Date().getFullYear();
  const valeurActuelle = select.value;
  select.innerHTML = "";
  for (let a = anneeActuelle + 1; a >= anneeActuelle - 5; a--) {
    const option = document.createElement("option");
    option.value = a;
    option.textContent = a;
    select.appendChild(option);
  }
  select.value = valeurActuelle || anneeActuelle;
}

async function chargerCategoriesTransaction() {
  const select = document.getElementById("transaction-categorie");
  select.innerHTML = "";
  const snap = await db.collection("categories").where("actif", "==", true).orderBy("nom").get();
  snap.forEach((doc) => {
    const option = document.createElement("option");
    option.value = doc.data().nom;
    option.textContent = doc.data().nom;
    select.appendChild(option);
  });
}

async function obtenirSoldeInitial(compteId, annee) {
  const doc = await db.collection("soldesInitiaux").doc(`${compteId}_${annee}`).get();
  return doc.exists ? doc.data().soldeInitial : 0;
}

async function chargerListe() {
  const compteId = document.getElementById("filtre-compte").value;
  const annee = parseInt(document.getElementById("filtre-annee").value, 10);
  const corps = document.getElementById("corps-tableau");
  const messageVide = document.getElementById("message-vide");
  corps.innerHTML = "";
  if (!compteId || !annee) return;

  const soldeInitial = await obtenirSoldeInitial(compteId, annee);
  document.getElementById("ligne-solde-initial").textContent =
    `Solde initial : ${formaterMontant(soldeInitial)} (défini dans Gestion). Glissez une ligne (⠿) pour changer son ordre.`;

  const [snapDemandes, snapTransactions] = await Promise.all([
    db.collection("demandes").where("compteId", "==", compteId).where("annee", "==", annee).get(),
    db.collection("transactions").where("compteId", "==", compteId).where("annee", "==", annee).get()
  ]);

  const demandes = snapDemandes.docs.map(d => ({ id: d.id, type: "demande", ...d.data() }));
  const transactions = snapTransactions.docs.map(d => ({ id: d.id, type: "transaction", ...d.data() }));
  listeActuelle = [...demandes, ...transactions].sort((a, b) => (a.ordre || 0) - (b.ordre || 0));

  if (listeActuelle.length === 0) {
    messageVide.style.display = "block";
    return;
  }
  messageVide.style.display = "none";

  let solde = soldeInitial;

  listeActuelle.forEach((item, index) => {
    const montantSigne = item.type === "transaction" && item.typeTransaction === "revenu"
      ? Number(item.montant)
      : -Number(item.montant);
    solde += montantSigne;
    const soldeNegatif = solde < 0;

    const tr = document.createElement("tr");
    tr.draggable = true;
    tr.dataset.index = index;

    const description = item.type === "demande" ? item.personneNom : item.description;
    const dateAffichee = item.type === "demande" ? formaterDate(item.dateCreation) : (item.date || "—");
    const statutHtml = item.type === "demande"
      ? `<span class="badge ${item.statut}">${libelleStatut(item.statut)}</span>`
      : `<span class="badge payee">${item.typeTransaction === "revenu" ? "Revenu" : "Dépense"}</span>`;
    const pieceHtml = item.type === "demande"
      ? `<a href="${item.pieceJointeUrl}" target="_blank" rel="noopener">Voir</a>`
      : "";
    const actionHtml = item.type === "demande" && item.statut === "en_attente"
      ? `<button class="bouton" data-id="${item.id}">Approuver</button>`
      : item.type === "demande" && item.statut === "en_cours_paiement"
      ? `<button class="bouton secondaire" data-marquer-payee="${item.id}" data-nom="${item.personneNom}">Marquer payée</button>`
      : item.type === "transaction"
      ? `<button class="bouton secondaire" data-modifier-transaction="${item.id}">Modifier</button>`
      : "";

    tr.innerHTML = `
      <td style="cursor:grab;color:var(--gris);">⠿</td>
      <td>${dateAffichee}</td>
      <td>${description}</td>
      <td class="mono">${item.type === "transaction" && item.typeTransaction === "revenu" ? "+" : "-"}${formaterMontant(item.montant)}</td>
      <td class="mono" style="${soldeNegatif ? "color:var(--rouge);font-weight:600;" : ""}">${formaterMontant(solde)}</td>
      <td>${item.categorie || "—"}</td>
      <td>${statutHtml}</td>
      <td>${pieceHtml}</td>
      <td>${actionHtml}</td>
    `;
    corps.appendChild(tr);
  });

  corps.querySelectorAll("button[data-id]").forEach((bouton) => {
    bouton.addEventListener("click", () => ouvrirModaleApprobation(bouton.dataset.id));
  });
  corps.querySelectorAll("button[data-marquer-payee]").forEach((bouton) => {
    bouton.addEventListener("click", () => marquerPayeeManuellement(bouton.dataset.marquerPayee, bouton.dataset.nom));
  });
  corps.querySelectorAll("button[data-modifier-transaction]").forEach((bouton) => {
    bouton.addEventListener("click", () => ouvrirModaleTransaction(bouton.dataset.modifierTransaction));
  });

  activerGlisserDeposer(corps);
}

function libelleStatut(statut) {
  return { en_attente: "En attente", en_cours_paiement: "En cours de paiement", payee: "Payée" }[statut] || statut;
}

// --- Glisser-déposer pour réordonner manuellement ---

function activerGlisserDeposer(corps) {
  let ligneGlissee = null;

  corps.querySelectorAll("tr").forEach((tr) => {
    tr.addEventListener("dragstart", () => { ligneGlissee = tr; tr.style.opacity = "0.4"; });
    tr.addEventListener("dragend", () => { tr.style.opacity = "1"; });
    tr.addEventListener("dragover", (e) => e.preventDefault());
    tr.addEventListener("drop", async (e) => {
      e.preventDefault();
      if (!ligneGlissee || ligneGlissee === tr) return;
      const indexDepart = parseInt(ligneGlissee.dataset.index, 10);
      const indexArrivee = parseInt(tr.dataset.index, 10);

      const [item] = listeActuelle.splice(indexDepart, 1);
      listeActuelle.splice(indexArrivee, 0, item);

      // Renumérote tout le monde en séquence (les nouveaux ajouts utilisent
      // Date.now(), donc toujours plus grand — pas de collision).
      const lots = listeActuelle.map((it, i) => ({ id: it.id, type: it.type, ordre: i + 1 }));
      const batch = db.batch();
      lots.forEach((l) => {
        const ref = db.collection(l.type === "demande" ? "demandes" : "transactions").doc(l.id);
        batch.update(ref, { ordre: l.ordre });
      });
      await batch.commit();
      chargerListe();
    });
  });
}

// --- Approbation d'une demande (inchangé, sauf accès à listeActuelle) ---

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
    chargerListe();
  } catch (err) {
    erreurEl.textContent = "Erreur : " + err.message;
    erreurEl.style.display = "block";
  } finally {
    bouton.disabled = false;
    bouton.textContent = "Approuver et envoyer le courriel";
  }
});

// --- Marquer payée manuellement, avec repositionnement sous la dernière payée ---

function calculerOrdreApresDernierePayees(idExclu) {
  const autres = listeActuelle.filter(item => item.id !== idExclu);
  const regles = autres.filter(item => item.type === "transaction" || item.statut === "payee");

  if (regles.length === 0) {
    const minOrdre = autres.length ? Math.min(...autres.map(i => i.ordre || 0)) : Date.now();
    return minOrdre - 1;
  }
  const dernierOrdre = Math.max(...regles.map(i => i.ordre || 0));
  const suivants = autres.filter(i => (i.ordre || 0) > dernierOrdre);
  if (suivants.length === 0) return dernierOrdre + 1;
  const prochainOrdre = Math.min(...suivants.map(i => i.ordre || 0));
  return (dernierOrdre + prochainOrdre) / 2;
}

async function marquerPayeeManuellement(demandeId, nomPersonne) {
  const confirme = confirm(
    `Confirmer que la demande de ${nomPersonne} a bel et bien été payée ?\n\n` +
    `À utiliser seulement si le lien du courriel n'a pas fonctionné ou n'a pas été cliqué.`
  );
  if (!confirme) return;

  const nouvelOrdre = calculerOrdreApresDernierePayees(demandeId);

  await db.collection("demandes").doc(demandeId).update({
    statut: "payee",
    datePaiement: firebase.firestore.FieldValue.serverTimestamp(),
    marqueePayeeManuellementPar: profilActuel.nom || profilActuel.email,
    ordre: nouvelOrdre
  });
  chargerListe();
}

// --- Transactions manuelles (revenus/dépenses) ---

document.getElementById("bouton-nouvelle-transaction").addEventListener("click", () => ouvrirModaleTransaction(null));

async function ouvrirModaleTransaction(transactionId) {
  transactionSelectionneeId = transactionId;
  document.getElementById("transaction-erreur").style.display = "none";
  document.getElementById("transaction-supprimer").style.display = transactionId ? "inline-block" : "none";
  document.getElementById("modale-transaction-titre").textContent = transactionId ? "Modifier la transaction" : "Nouvelle transaction";

  if (transactionId) {
    const doc = await db.collection("transactions").doc(transactionId).get();
    const t = doc.data();
    document.getElementById("transaction-type").value = t.typeTransaction;
    document.getElementById("transaction-description").value = t.description;
    document.getElementById("transaction-montant").value = t.montant;
    document.getElementById("transaction-date").value = t.date || "";
    document.getElementById("transaction-categorie").value = t.categorie || "";
  } else {
    document.getElementById("transaction-type").value = "revenu";
    document.getElementById("transaction-description").value = "";
    document.getElementById("transaction-montant").value = "";
    document.getElementById("transaction-date").value = new Date().toISOString().slice(0, 10);
  }

  document.getElementById("modale-transaction").style.display = "flex";
}

document.getElementById("transaction-annuler").addEventListener("click", () => {
  document.getElementById("modale-transaction").style.display = "none";
});

document.getElementById("transaction-confirmer").addEventListener("click", async () => {
  const erreurEl = document.getElementById("transaction-erreur");
  erreurEl.style.display = "none";

  const compteId = document.getElementById("filtre-compte").value;
  const annee = parseInt(document.getElementById("filtre-annee").value, 10);
  const typeTransaction = document.getElementById("transaction-type").value;
  const description = document.getElementById("transaction-description").value.trim();
  const montant = parseFloat(document.getElementById("transaction-montant").value);
  const date = document.getElementById("transaction-date").value;
  const categorie = document.getElementById("transaction-categorie").value;

  if (!description || !montant) {
    erreurEl.textContent = "Remplissez au moins la description et le montant.";
    erreurEl.style.display = "block";
    return;
  }

  const donnees = { compteId, annee, typeTransaction, description, montant, date, categorie };

  if (transactionSelectionneeId) {
    await db.collection("transactions").doc(transactionSelectionneeId).update(donnees);
  } else {
    await db.collection("transactions").add({
      ...donnees,
      ordre: Date.now(),
      creePar: profilActuel.uid,
      creeParNom: profilActuel.nom || profilActuel.email,
      dateCreation: firebase.firestore.FieldValue.serverTimestamp()
    });
  }

  document.getElementById("modale-transaction").style.display = "none";
  chargerListe();
});

document.getElementById("transaction-supprimer").addEventListener("click", async () => {
  if (!transactionSelectionneeId) return;
  if (!confirm("Supprimer définitivement cette transaction ?")) return;
  await db.collection("transactions").doc(transactionSelectionneeId).delete();
  document.getElementById("modale-transaction").style.display = "none";
  chargerListe();
});
