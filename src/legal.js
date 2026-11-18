'use strict'

// Short, honest privacy notice served at GET /privacy so the widget can link to
// something real. The full bilingual policy also lives on the Messenger service.

const cfg = require('./config')

const PAGE = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Confidentialité — ASSIAA · AGC</title>
<style>
body{margin:0;font:400 15px/1.6 -apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:#16233A;background:#F6F7F9}
header{background:#fff;border-bottom:3px solid #E2001A;padding:16px 20px;display:flex;gap:12px;align-items:center}
.aga{background:#E2001A;color:#fff;font-weight:800;padding:6px 10px;border-radius:6px;font-size:14px;letter-spacing:.5px}
header b{color:#0A2A5E}
main{max-width:760px;margin:0 auto;padding:26px 20px 60px}
h1{color:#0A2A5E;font-size:24px;margin:0 0 4px}
.sub{color:#5B6472;font-size:13px;margin:0 0 22px}
.card{background:#fff;border:1px solid #E3E6EC;border-radius:10px;padding:18px 20px;margin:14px 0}
h2{color:#0A2A5E;font-size:16px;margin:18px 0 6px}
ul{padding-left:20px}li{margin:4px 0}
a{color:#0B63CE}
footer{max-width:760px;margin:0 auto;padding:0 20px 40px;color:#5B6472;font-size:12px}
</style></head>
<body>
<header><span class="aga">AGC</span><b>ASSIAA — ${cfg.COMPANY}</b></header>
<main>
<h1>Politique de confidentialité</h1>
<p class="sub">Dernière mise à jour : ${new Date().toISOString().slice(0, 10)} · Version 1.0 (à valider par AGC).</p>

<div class="card">
<h2>Quelles données</h2>
<ul>
  <li>Le contenu des messages que vous écrivez à ASSIAA sur ce site ;</li>
  <li>Un identifiant de conversation technique, conservé dans votre navigateur (sessionStorage) ;</li>
  <li>La langue de la conversation et l'horodatage des échanges.</li>
</ul>
<p>Aucun compte, aucun mot de passe, aucune donnée bancaire ne vous est demandé. Ne partagez pas de données sensibles
dans le chat : un conseiller les recueille par les canaux officiels d'AGC.</p>

<h2>Pourquoi</h2>
<ul>
  <li>Répondre à vos questions sur les produits et services d'AGC ;</li>
  <li>Préparer un devis ou enregistrer une déclaration de sinistre lorsque vous le demandez ;</li>
  <li>Vous mettre en relation avec un conseiller humain.</li>
</ul>

<h2>Qui y accède</h2>
<ul>
  <li>Les conseillers et le personnel habilités d'AGC ;</li>
  <li><strong>Google</strong> (Gemini), pour la compréhension du langage naturel ;</li>
  <li><strong>Render</strong>, pour l'hébergement technique.</li>
</ul>
<p>Nous ne vendons ni ne louons vos données. Aucun profilage publicitaire.</p>

<h2>Combien de temps</h2>
<ul>
  <li>Mémoire de la conversation : <strong>3 heures</strong> après le dernier message, puis effacement automatique ;</li>
  <li>Journaux techniques : <strong>30 jours</strong> au maximum.</li>
</ul>

<h2>Vos droits</h2>
<p>Accès, rectification ou suppression : écrivez à
<a href="mailto:agc@agc-assurances.com">agc@agc-assurances.com</a> ou appelez le +237 233 43 89 38.</p>
</div>
</main>
<footer>${cfg.COMPANY} — ${cfg.SLOGAN}. Immeuble le Cauris, Rue Alfred Saker, Akwa, Douala, BP 1290, Cameroun.</footer>
</body></html>`

module.exports = { PAGE }
