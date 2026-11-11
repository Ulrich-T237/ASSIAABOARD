# ASSIAA — version WEB (site AGC)

L'assistante **ASSIAA** d'**Assurances Générales du Cameroun (AGC)** — « Le gage de votre sécurité » — en version **web**, à ajouter sur le site `agc-assurances.com`.

> **Projet totalement indépendant du bot WhatsApp.** Aucun Baileys, aucun téléphone lié, aucun MongoDB : c'est un petit serveur web autonome. Même assistante, même script, même cerveau, même mémoire du site AGC — et un bouton **« Continuer vers WhatsApp »** vers le **+237 683 70 80 03**.

---

## Ce que fait l'assistante web

| | |
|---|---|
| 🎬 **S'ouvre directement** | La page (ou la pastille) affiche immédiatement le script : intro ASSIAA + menu numéroté, selon l'heure de **Douala** (Africa/Douala) |
| 🧠 **Même cerveau** | Gemini (`gemini-3.5-flash-lite`, chaîne de repli complète) + outil `read_agc_site` : elle lit le site AGC en direct, répond à tout (assurance, vie, hors-sujet), FR ou EN selon **le dernier message** |
| 🔢 **Menu identique** | 1 Automobile · 2 Santé · 3 Voyage · 4 MRH · 5 Autres produits · 6 Devis · 7 Sinistre · 8 Carte santé · 9 Agences · 10 Horaires & contact — au numéro **ou** au mot-clé |
| 💬 **Devis / sinistre** | Elle collecte les informations, donne une référence (`DEV-…` / `SIN-…`) **et** prépare le résumé pour WhatsApp |
| 📍 **Espace Clients** | « Vos contrats sont dans l'Espace Clients » — puis elle **demande la ville** et donne l'agence |
| 🟢 **Continuer vers WhatsApp** | Bouton permanent dans l'en-tête + carte de transfert dans la conversation → `wa.me/237683708003`, message **pré-rempli** (avec le résumé de la demande si un devis/sinistre vient d'être rempli) |

---

## Comment l'ajouter au site AGC (3 options)

### Option 1 — la pastille flottante (recommandé, 1 ligne)

Avant `</body>` de la page AGC (thème WordPress : *Apparence → Éditeur de thème → footer.php*, ou un bloc HTML/Elementor) :

```html
<script src="https://VOTRE-SERVICE.onrender.com/widget.js" defer></script>
```

→ Une pastille **ASSIAA** apparaît en bas à droite ; au clic, l'assistante s'ouvre **dans la page** (panneau flottant, iframe isolée : aucun conflit de style avec le thème).

Variantes :
```html
<script src="https://VOTRE-SERVICE.onrender.com/widget.js"
        data-position="left"          /* left | right */
        data-label="Un conseil ? Écrivez-nous"
        data-open="1"                 /* ouvre automatiquement */
        defer></script>
```

### Option 2 — une section intégrée dans une page

```html
<iframe src="https://VOTRE-SERVICE.onrender.com/embed"
        style="width:100%;height:640px;border:0;border-radius:16px"
        title="ASSIAA — assistante AGC"></iframe>
```

### Option 3 — un bouton qui ouvre l'assistante en pleine page

```html
<a href="https://VOTRE-SERVICE.onrender.com/" target="_blank" rel="noopener">Parler à ASSIAA</a>
```

### Voir le rendu

- `https://VOTRE-SERVICE.onrender.com/demo` → page de démonstration imitant une page AGC avec la pastille
- `https://VOTRE-SERVICE.onrender.com/` → l'assistante en pleine page
- `https://VOTRE-SERVICE.onrender.com/embed` → version sans habillage (pour iframe)

---

## Déploiement (Render — nouveau service, indépendant)

1. **GitHub** : nouveau dépôt (ex. `ASSIAA-WEB`) → y déposer ce dossier (glisser-déposer suffit).
2. **Render → + New → Web Service** → choisir ce dépôt.
   - Region : **Frankfurt** · Instance : **Starter (payant)** (ou Free pour tester)
   - Build : `npm install` · Start : `npm start` · Health check : `/api/health`
3. **Environment** :

| Clé | Valeur |
|---|---|
| `GEMINI_API_KEY` | votre clé Gemini |
| `GEMINI_MODEL` | `gemini-3.5-flash-lite` |
| `GEMINI_MODEL_FALLBACKS` | `gemini-flash-lite-latest,gemini-3.1-flash-lite,gemini-3.5-flash,gemini-3.6-flash,gemini-3.8-flash,gemini-2.5-flash` |
| `WHATSAPP_NUMBER` | `237683708003` |
| `ALLOWED_ORIGINS` | `https://agc-assurances.com,https://www.agc-assurances.com` (ou `*`) |

`PORT` est fourni par Render automatiquement.

4. Copier l'URL du service (ex. `https://assiaa-web.onrender.com`) → c'est elle qui remplace `VOTRE-SERVICE` dans le snippet de la page AGC.

---

## En local

```bash
npm install
cp .env.example .env     # puis mettre GEMINI_API_KEY
npm start                # http://localhost:10000  (demo: /demo · embed: /embed)
npm test                 # recette : 44 contrôles (script, menu, flows, cerveau live, CTA)
```

---

## API (si vous voulez un bouton maison)

```js
// 1. ouvrir la conversation
const s = await fetch('https://VOTRE-SERVICE/api/start', {
  method:'POST', headers:{'content-type':'application/json'},
  body: JSON.stringify({ lang:'fr' })
}).then(r => r.json())
// s.sessionId, s.replies[] (intro + menu), s.wa.url (lien WhatsApp pré-rempli)

// 2. envoyer un message
const out = await fetch('https://VOTRE-SERVICE/api/chat', {
  method:'POST', headers:{'content-type':'application/json'},
  body: JSON.stringify({ sessionId: s.sessionId, text: '6' })
}).then(r => r.json())
// out.replies[], out.lang, out.wa.url
```

`GET /api/health` → état du service (uptime, modèle cerveau, nombre de sessions).

---

## Notes techniques

- **Pas de base de données** : la conversation vit en mémoire côté serveur (TTL **3 h**, max 2 000 sessions) — le navigateur garde seulement un identifiant. Les demandes de devis/sinistre ne sont pas stockées : elles sont **transmises par WhatsApp** (message pré-rempli) pour être traitées par un conseiller.
- **Anti-abus** : limitation à **30 messages/minute/IP** sur `/api/chat`.
- **CORS** : configurable via `ALLOWED_ORIGINS` (le widget passe par une iframe, donc même sans CORS il fonctionne).
- **Mémoire du site** : `data/pages/*.md` (11 pages publiques d'AGC) + rafraîchissement automatique toutes les 6 h ; si le site est down, elle répond depuis la copie locale.
- **Aucun secret côté navigateur** : la clé Gemini reste sur le serveur.
- Mise à jour du contenu AGC : elle se fait toute seule (rafraîchissement) ; pour figer un texte, éditez `data/pages/`.

---

## Recette (dernier passage : **44/44** ✅)

```bash
npm test
```
Couvre : ouverture directe FR/EN · menu 10 entrées · garanties issues du site · devis (référence + CTA pré-rempli) · sinistre · Espace Clients (demande la ville) · annulation · cerveau live FR + EN · horloge Douala · mémoire du site · numéro WhatsApp.
