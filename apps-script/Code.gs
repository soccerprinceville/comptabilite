/**
 * "Serveur" du projet de comptabilité du club.
 * Voir README.md pour les étapes de déploiement.
 *
 * Rôles de ce script :
 *  - Recevoir les fichiers du site web et les déposer sur Google Drive
 *    (action "uploadFichier").
 *  - Envoyer le courriel Gmail d'approbation avec les pièces jointes
 *    (action "envoyerCourriel").
 *  - Recevoir le clic du lien "paiement effectué" dans le courriel et mettre
 *    à jour Firestore (doGet, action=confirmerPaiement).
 *
 * Nécessite la bibliothèque "OAuth2 pour Apps Script" (voir README.md) et les
 * propriétés de script : FIREBASE_PROJECT_ID, SERVICE_ACCOUNT_JSON,
 * DOSSIER_PIECES_JOINTES_ID, DOSSIER_SPECIMENS_ID.
 */

function doPost(e) {
  let resultat;
  try {
    const params = JSON.parse(e.postData.contents);
    if (params.action === "uploadFichier") {
      resultat = uploadFichier_(params);
    } else if (params.action === "envoyerCourriel") {
      resultat = envoyerCourriel_(params);
    } else {
      throw new Error("Action inconnue : " + params.action);
    }
    resultat.ok = true;
  } catch (err) {
    resultat = { ok: false, erreur: err.message };
  }
  return ContentService.createTextOutput(JSON.stringify(resultat))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  if (e.parameter.action === "confirmerPaiement") {
    return confirmerPaiement_(e.parameter.id, e.parameter.token);
  }
  return HtmlService.createHtmlOutput("Requête invalide.");
}

// ---------------------------------------------------------------------
// Upload de fichiers vers Google Drive
// ---------------------------------------------------------------------

function uploadFichier_(params) {
  const props = PropertiesService.getScriptProperties();
  const idDossier = params.dossier === "specimens"
    ? props.getProperty("DOSSIER_SPECIMENS_ID")
    : props.getProperty("DOSSIER_PIECES_JOINTES_ID");

  const dossier = DriveApp.getFolderById(idDossier);
  const octets = Utilities.base64Decode(params.contenuBase64);
  const blob = Utilities.newBlob(octets, params.mimeType, params.nomFichier);
  const fichier = dossier.createFile(blob);
  fichier.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  return { fileId: fichier.getId(), url: fichier.getUrl() };
}

// ---------------------------------------------------------------------
// Envoi du courriel Gmail d'approbation
// ---------------------------------------------------------------------

function envoyerCourriel_(params) {
  const pieces = [
    DriveApp.getFileById(params.pieceJointeFileId).getBlob(),
    DriveApp.getFileById(params.specimenChequeFileId).getBlob()
  ];

  const sujet = `Demande de remboursement à payer — ${params.personneNom} (${params.montant} $)`;

  const corpsHtml = `
    <p>Une demande de remboursement a été approuvée et doit être payée :</p>
    <ul>
      <li><strong>Personne à rembourser :</strong> ${params.personneNom}</li>
      <li><strong>Montant :</strong> ${Number(params.montant).toFixed(2)} $</li>
      <li><strong>Catégorie :</strong> ${params.categorie}</li>
    </ul>
    <p>La pièce justificative et le spécimen de chèque sont joints à ce courriel.</p>
    <p>
      <strong>Une fois le paiement effectué</strong>, cliquez sur le lien
      ci-dessous pour indiquer que la demande a été payée :
    </p>
    <p><a href="${params.lienConfirmation}">✔ Confirmer que le paiement a été effectué</a></p>
  `;

  GmailApp.sendEmail(params.destinataires.join(","), sujet, "", {
    htmlBody: corpsHtml,
    attachments: pieces,
    name: "Comptabilité du club"
  });

  return {};
}

// ---------------------------------------------------------------------
// Confirmation de paiement (clic du lien reçu par courriel)
// ---------------------------------------------------------------------

function confirmerPaiement_(id, token) {
  if (!id || !token) {
    return HtmlService.createHtmlOutput("Lien invalide.");
  }

  const demande = firestoreGetDoc_("demandes", id);
  if (!demande) {
    return HtmlService.createHtmlOutput("Demande introuvable.");
  }
  if (demande.token !== token) {
    return HtmlService.createHtmlOutput("Lien invalide ou expiré.");
  }
  if (demande.statut === "payee") {
    return HtmlService.createHtmlOutput("Cette demande a déjà été marquée comme payée.");
  }

  const aujourdhui = new Date().toISOString();
  firestorePatchDoc_("demandes", id, {
    statut: "payee",
    datePaiement: aujourdhui
  });

  return HtmlService.createHtmlOutput(
    `<p>✔ Merci ! La demande de <strong>${demande.personneNom}</strong> a été marquée comme <strong>payée</strong> en date d'aujourd'hui.</p>`
  );
}

// ---------------------------------------------------------------------
// Accès à Firestore via un compte de service (contourne les règles de
// sécurité, ce qui est voulu : ce script agit comme un serveur de confiance)
// ---------------------------------------------------------------------

function getServiceOAuth_() {
  const props = PropertiesService.getScriptProperties();
  const cle = JSON.parse(props.getProperty("SERVICE_ACCOUNT_JSON"));
  return OAuth2.createService("FirestoreServiceAccount")
    .setTokenUrl("https://oauth2.googleapis.com/token")
    .setPrivateKey(cle.private_key)
    .setIssuer(cle.client_email)
    .setPropertyStore(PropertiesService.getScriptProperties())
    .setScope("https://www.googleapis.com/auth/datastore");
}

function firestoreBaseUrl_() {
  const idProjet = PropertiesService.getScriptProperties().getProperty("FIREBASE_PROJECT_ID");
  return `https://firestore.googleapis.com/v1/projects/${idProjet}/databases/(default)/documents`;
}

function firestoreGetDoc_(collection, id) {
  const jeton = getServiceOAuth_().getAccessToken();
  const reponse = UrlFetchApp.fetch(`${firestoreBaseUrl_()}/${collection}/${id}`, {
    headers: { Authorization: "Bearer " + jeton },
    muteHttpExceptions: true
  });
  if (reponse.getResponseCode() !== 200) return null;
  return firestoreVersFields_(JSON.parse(reponse.getContentText()).fields || {});
}

function firestorePatchDoc_(collection, id, valeurs) {
  const jeton = getServiceOAuth_().getAccessToken();
  const champs = Object.keys(valeurs);
  const masque = champs.map(c => `updateMask.fieldPaths=${encodeURIComponent(c)}`).join("&");
  const url = `${firestoreBaseUrl_()}/${collection}/${id}?${masque}`;

  UrlFetchApp.fetch(url, {
    method: "patch",
    contentType: "application/json",
    headers: { Authorization: "Bearer " + jeton },
    payload: JSON.stringify({ fields: fieldsVersFirestore_(valeurs) }),
    muteHttpExceptions: true
  });
}

// Convertit les valeurs Firestore REST (typées) en valeurs JS simples.
function firestoreVersFields_(fields) {
  const resultat = {};
  Object.keys(fields).forEach((cle) => {
    const valeur = fields[cle];
    if ("stringValue" in valeur) resultat[cle] = valeur.stringValue;
    else if ("doubleValue" in valeur) resultat[cle] = valeur.doubleValue;
    else if ("integerValue" in valeur) resultat[cle] = Number(valeur.integerValue);
    else if ("timestampValue" in valeur) resultat[cle] = valeur.timestampValue;
    else if ("nullValue" in valeur) resultat[cle] = null;
    else resultat[cle] = valeur;
  });
  return resultat;
}

// Convertit des valeurs JS simples en format typé Firestore REST.
function fieldsVersFirestore_(valeurs) {
  const resultat = {};
  Object.keys(valeurs).forEach((cle) => {
    const v = valeurs[cle];
    if (v === null) resultat[cle] = { nullValue: null };
    else if (typeof v === "number") resultat[cle] = { doubleValue: v };
    else if (cle.toLowerCase().startsWith("date")) resultat[cle] = { timestampValue: v };
    else resultat[cle] = { stringValue: String(v) };
  });
  return resultat;
}
