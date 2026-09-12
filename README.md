# Comptabilité du club — Guide d'installation

Application web pour la gestion des demandes de remboursement du club
(saisie, suivi, approbation, paiement) avec pièces jointes sur Google Drive
et notification par Gmail.

## Architecture retenue

| Brique | Techno | Pourquoi |
|---|---|---|
| Hébergement du site | GitHub Pages | Statique, gratuit, demandé |
| Authentification (user/pass + rôles) | Firebase Authentication | Simple, sécurisé, gratuit (Spark) |
| Base de données | Firebase Firestore | Demandé, gratuit (Spark) |
| Dépôt des pièces jointes | Google Drive | Demandé |
| Envoi des courriels | Gmail | Demandé |
| "API" qui reçoit le clic du lien d'approbation + upload Drive + envoi Gmail | **Google Apps Script** (déployé comme application web) | Gratuit (pas besoin du forfait payant Firebase "Blaze"), fonctionne avec le compte Google que vous avez déjà |

Firebase (Auth + Firestore) reste sur le forfait gratuit **Spark**. Apps Script
joue le rôle de petit serveur pour tout ce qui touche Drive/Gmail, incluant le
lien "paiement effectué" reçu par courriel.

## Étapes de mise en place (à faire une seule fois)

### 1. Créer le projet Firebase
1. Allez sur https://console.firebase.google.com → **Ajouter un projet**.
2. Une fois créé, dans **Créer une application → Web (</>)**, copiez l'objet
   `firebaseConfig` et collez-le dans `js/firebase-config.js` (voir le fichier,
   les valeurs à remplacer sont indiquées).
3. Dans le menu **Build → Authentication → Sign-in method**, activez
   **Adresse e-mail/Mot de passe**.
4. Dans **Build → Authentication → Users**, créez un compte pour chaque
   comptable/directeur (courriel + mot de passe).
5. Dans **Build → Firestore Database**, créez la base (mode production).
6. Copiez le contenu de `firestore.rules` dans l'onglet **Règles** de
   Firestore et publiez.
7. Pour chaque utilisateur créé à l'étape 4, ajoutez un document dans la
   collection `users` avec **comme ID de document l'UID de l'utilisateur**
   (visible dans l'onglet Authentication) :
   ```
   { "email": "...", "nom": "...", "role": "comptable" }  // ou "directeur"
   ```

### 2. Créer le dossier Google Drive
1. Dans le compte Google du club, créez un dossier `Comptabilité club` avec
   deux sous-dossiers : `Pièces jointes` et `Spécimens de chèque`.
2. Notez l'ID de chaque sous-dossier (dans l'URL du dossier après `/folders/`).

### 3. Déployer le "serveur" Google Apps Script
1. Allez sur https://script.google.com → **Nouveau projet**, sous le même
   compte Google que le Drive.
2. Collez le contenu de `apps-script/Code.gs`.
3. Menu **Ressources/Bibliothèques** (icône `+` à côté de Bibliothèques) →
   ajoutez la bibliothèque **OAuth2 pour Apps Script** de Google avec l'ID
   de script : `1B7FSrk5Zi6L1rSxxTDgDEUsPzlukDsi4KGuTMorsTQHhGBzBkMun4iDF`.
4. Dans Firebase Console → ⚙️ **Paramètres du projet → Comptes de service**,
   cliquez **Générer une nouvelle clé privée** (fichier JSON).
5. Dans Apps Script, menu **Paramètres du projet → Propriétés du script**,
   ajoutez :
   - `FIREBASE_PROJECT_ID` = l'ID de votre projet Firebase
   - `SERVICE_ACCOUNT_JSON` = collez le **contenu complet** du fichier JSON
   - `DOSSIER_PIECES_JOINTES_ID` = ID noté à l'étape 2
   - `DOSSIER_SPECIMENS_ID` = ID noté à l'étape 2
6. Menu **Déployer → Nouveau déploiement** → type **Application Web** :
   - Exécuter en tant que : **Moi**
   - Qui a accès : **Tout le monde**
7. Copiez l'URL de déploiement (se termine par `/exec`) et collez-la dans
   `js/firebase-config.js` sous `APPS_SCRIPT_URL`.

### 4. Publier le site sur GitHub Pages
1. Créez un dépôt GitHub, poussez tout le contenu de ce dossier.
2. **Settings → Pages** → Source : branche `main`, dossier `/ (root)`.
3. Votre site sera accessible à `https://<votre-compte>.github.io/<repo>/`.

## Modèle de données Firestore

- `users/{uid}` — `email`, `nom`, `role` (`comptable` | `directeur`)
- `personnes/{id}` — `nom`, `specimenChequeFileId`, `specimenChequeUrl`, `actif`
- `categories/{id}` — `nom`, `actif`
- `destinataires/{id}` — `email`, `nom`, `actif` (liste personnalisable des
  gens qui reçoivent le courriel « à payer »)
- `demandes/{id}` — `personneId`, `personneNom`, `montant`, `categorie`,
  `pieceJointeFileId`, `pieceJointeUrl`, `statut`
  (`en_attente` | `en_cours_paiement` | `payee`), `creePar`, `creeParNom`,
  `dateCreation`, `approuvePar`, `approuveParNom`, `dateApprobation`,
  `datePaiement`, `token`

## Rôles

- **Directeur** : peut saisir une nouvelle demande.
- **Comptable** : peut saisir une nouvelle demande, faire le suivi, approuver
  les demandes, gérer la liste des personnes à rembourser, des catégories et
  des destinataires du courriel de paiement.

## Ce qui est livré dans cette première version

- Connexion (Firebase Auth) avec redirection selon le rôle.
- Formulaire "Nouvelle demande" (personne, pièce jointe, montant).
- Écran de suivi (comptable) : liste en attente / en cours de paiement / payée,
  approbation (catégorie + vérification du spécimen), envoi automatique du
  courriel Gmail avec pièces jointes et lien d'approbation.
- Écran de gestion (comptable) : personnes à rembourser + spécimen de chèque,
  catégories, destinataires du courriel.
- Lien de confirmation de paiement (Apps Script) qui met à jour Firestore.

## Prochaines itérations possibles

- Tableaux de bord / export vers le fichier Excel existant.
- Historique des modifications, journal d'audit.
- Rappels automatiques pour les demandes en attente depuis longtemps.
