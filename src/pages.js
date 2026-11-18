'use strict'

// Public legal pages required by Meta App Review:
//   GET /privacy          → privacy policy (FR + EN)
//   GET /data-deletion    → user data deletion instructions (FR + EN)
// Both are deliberately short, honest and AGC-branded.

const cfg = require('./config')

const STYLE = `
  :root { --navy:#0A2A5E; --red:#E2001A; --grey:#5b6472; }
  * { box-sizing: border-box; }
  body { margin:0; font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
         color:#111b2b; background:#f6f7f9; line-height:1.62; }
  header { background:#fff; border-bottom:3px solid var(--red); padding:18px 22px;
           display:flex; align-items:center; gap:12px; }
  .aga { background:var(--red); color:#fff; font-weight:800; padding:6px 10px; border-radius:6px;
         letter-spacing:.5px; font-size:15px; }
  header .t { font-weight:700; color:var(--navy); font-size:15px; }
  main { max-width:820px; margin:0 auto; padding:26px 22px 60px; }
  h1 { color:var(--navy); font-size:26px; margin:0 0 6px; }
  h2 { color:var(--navy); font-size:18px; margin:30px 0 8px; }
  h3 { color:var(--navy); font-size:15px; margin:18px 0 6px; }
  .lead { color:var(--grey); font-size:14px; margin:0 0 22px; }
  .card { background:#fff; border:1px solid #e3e6ec; border-radius:10px; padding:20px 22px; margin:16px 0; }
  ul { padding-left:20px; } li { margin:4px 0; }
  a { color:#0B63CE; }
  .fr { border-left:4px solid var(--navy); }
  .en { border-left:4px solid var(--red); }
  code { background:#eef1f6; padding:2px 6px; border-radius:4px; font-size:13px; }
  footer { max-width:820px; margin:0 auto; padding:0 22px 40px; color:var(--grey); font-size:12px; }
`

function shell(title, body) {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} — ASSIAA · AGC</title>
<link rel="icon" href="/favicon.ico">
<style>${STYLE}</style>
</head>
<body>
<header><span class="aga">AGC</span><span class="t">ASSIAA — ${cfg.COMPANY}</span></header>
<main>${body}</main>
<footer>${cfg.COMPANY} — ${cfg.SLOGAN}. Immeuble le Cauris, Rue Alfred Saker, Akwa, Douala, BP 1290, Cameroun.
Contact : agc@agc-assurances.com — +237 233 43 89 38.</footer>
</body>
</html>`
}

function privacyPage() {
  const body = `
  <h1>Politique de confidentialité · Privacy Policy</h1>
  <p class="lead">Dernière mise à jour / Last updated : ${new Date().toISOString().slice(0, 10)} · Version 1.0 (à valider par AGC).</p>

  <div class="card fr">
    <h2>Français</h2>
    <p><strong>Qui est responsable ?</strong> ${cfg.COMPANY} (AGC), Immeuble le Cauris, Rue Alfred Saker, Akwa, Douala, BP 1290, Cameroun.</p>

    <h3>Quelles données sont traitées</h3>
    <ul>
      <li>Le <strong>contenu des messages</strong> que vous adressez à ASSIAA sur notre page Facebook ;</li>
      <li>Votre <strong>identifiant Facebook</strong> (identifiant technique attribué par Meta, qui ne contient ni votre nom ni votre e-mail) ;</li>
      <li>La <strong>langue</strong> de la conversation et l'horodatage des échanges ;</li>
      <li>Les informations que vous choisissez de nous confier (produit souhaité, ville, référence de devis ou de sinistre).</li>
    </ul>

    <h3>Pourquoi</h3>
    <ul>
      <li>Répondre à vos questions sur les produits et services d'AGC ;</li>
      <li>Préparer un devis ou enregistrer une déclaration de sinistre lorsque vous le demandez ;</li>
      <li>Vous mettre en relation avec un conseiller humain.</li>
    </ul>
    <p>Nous ne vendons ni ne louons vos données. Aucun profilage publicitaire n'est effectué.</p>

    <h3>Qui y accède</h3>
    <ul>
      <li>Les conseillers et le personnel habilités d'AGC ;</li>
      <li><strong>Meta Platforms</strong>, en tant que prestataire de messagerie (Messenger) ;</li>
      <li><strong>Google</strong> (Gemini), pour la compréhension du langage naturel ;</li>
      <li><strong>Render</strong> et <strong>MongoDB Atlas</strong>, pour l'hébergement technique.</li>
    </ul>

    <h3>Combien de temps</h3>
    <ul>
      <li>Mémoire de la conversation : <strong>3 heures</strong> après le dernier message, puis effacement automatique ;</li>
      <li>Journaux techniques : <strong>30 jours</strong> au maximum ;</li>
      <li>Un dossier de devis ou de sinistre suit les durées légales et contractuelles applicables chez AGC.</li>
    </ul>

    <h3>Vos droits</h3>
    <p>Vous pouvez demander l'accès, la rectification ou la suppression de vos données à tout moment :
    écrivez à <a href="mailto:agc@agc-assurances.com">agc@agc-assurances.com</a> ou utilisez la page
    <a href="/data-deletion">Suppression des données</a>.</p>

    <h3>Sécurité</h3>
    <p>Les échanges circulent en HTTPS. Les clés d'accès sont stockées dans l'environnement du serveur, jamais dans le code source.</p>
  </div>

  <div class="card en">
    <h2>English</h2>
    <p><strong>Who is responsible?</strong> ${cfg.COMPANY} (AGC), Immeuble le Cauris, Rue Alfred Saker, Akwa, Douala, BP 1290, Cameroon.</p>

    <h3>What we process</h3>
    <ul>
      <li>The <strong>content of the messages</strong> you send to ASSIAA on our Facebook Page;</li>
      <li>Your <strong>Facebook user ID</strong> (a technical identifier issued by Meta — it contains neither your name nor your e-mail);</li>
      <li>The <strong>language</strong> of the conversation and the timestamps of the exchange;</li>
      <li>Whatever you choose to tell us (product of interest, city, quote or claim reference).</li>
    </ul>

    <h3>Why</h3>
    <ul>
      <li>Answer your questions about AGC products and services;</li>
      <li>Prepare a quote or record a claim when you ask for it;</li>
      <li>Connect you with a human advisor.</li>
    </ul>
    <p>We never sell or rent your data, and we do not run advertising profiling.</p>

    <h3>Who sees it</h3>
    <ul>
      <li>Authorised AGC advisors and staff;</li>
      <li><strong>Meta Platforms</strong>, as the messaging provider (Messenger);</li>
      <li><strong>Google</strong> (Gemini), for natural-language understanding;</li>
      <li><strong>Render</strong> and <strong>MongoDB Atlas</strong>, for technical hosting.</li>
    </ul>

    <h3>How long</h3>
    <ul>
      <li>Conversation memory: <strong>3 hours</strong> after your last message, then erased automatically;</li>
      <li>Technical logs: <strong>30 days</strong> at most;</li>
      <li>A quote or claim file follows the legal and contractual retention rules that apply at AGC.</li>
    </ul>

    <h3>Your rights</h3>
    <p>You may request access, correction or deletion at any time: write to
    <a href="mailto:agc@agc-assurances.com">agc@agc-assurances.com</a> or use the
    <a href="/data-deletion">Data deletion</a> page.</p>

    <h3>Security</h3>
    <p>Traffic is encrypted over HTTPS. Access keys live in the server environment, never in the source code.</p>
  </div>
  `
  return shell('Politique de confidentialité', body)
}

function deletionPage() {
  const body = `
  <h1>Suppression de vos données · Data deletion</h1>
  <p class="lead">Demandez la suppression des données échangées avec ASSIAA sur la page Facebook d'AGC.</p>

  <div class="card fr">
    <h2>Français</h2>
    <p><strong>Le plus simple :</strong> envoyez le message <code>supprimer mes données</code> à ASSIAA dans Messenger.
    La demande est enregistrée et traitée sous 30 jours.</p>
    <p><strong>Ou par e-mail :</strong> écrivez à
    <a href="mailto:agc@agc-assurances.com?subject=Suppression%20de%20mes%20donn%C3%A9es%20ASSIAA">agc@agc-assurances.com</a>
    avec l'objet « Suppression de mes données ASSIAA ». Indiquez le nom de la page Facebook utilisée et, si possible,
    la date approximative de la conversation.</p>

    <h3>Ce qui est supprimé</h3>
    <ul>
      <li>Le contenu des messages et la mémoire de la conversation ;</li>
      <li>Votre identifiant Facebook associé à cette conversation ;</li>
      <li>Les journaux techniques liés à cet échange.</li>
    </ul>

    <h3>Ce qui est conservé</h3>
    <p>Un devis émis ou une déclaration de sinistre enregistrée sont des documents contractuels :
    ils restent soumis aux durées légales de conservation d'AGC. Signalez-le si votre demande concerne aussi ce dossier,
    nous vous indiquerons la procédure applicable.</p>

    <h3>Délai</h3>
    <p>Suppression effective sous <strong>30 jours</strong>. Une confirmation vous est adressée par le même canal.</p>
  </div>

  <div class="card en">
    <h2>English</h2>
    <p><strong>Easiest:</strong> send the message <code>delete my data</code> to ASSIAA in Messenger.
    The request is recorded and processed within 30 days.</p>
    <p><strong>Or by e-mail:</strong> write to
    <a href="mailto:agc@agc-assurances.com?subject=ASSIAA%20data%20deletion">agc@agc-assurances.com</a>
    with the subject “ASSIAA data deletion”. Mention the Facebook Page you used and, if possible,
    the approximate date of the conversation.</p>

    <h3>What we delete</h3>
    <ul>
      <li>The message content and the conversation memory;</li>
      <li>Your Facebook user ID tied to that conversation;</li>
      <li>The technical logs of that exchange.</li>
    </ul>

    <h3>What we keep</h3>
    <p>An issued quote or a recorded claim is a contractual document and remains subject to AGC's statutory retention periods.
    If your request also concerns such a file, tell us and we will explain the applicable procedure.</p>

    <h3>Timeline</h3>
    <p>Deletion completed within <strong>30 days</strong>, with a confirmation sent through the same channel.</p>
  </div>

  <div class="card">
    <h3>Confirmation de suppression · Deletion status</h3>
    <p>Chaque demande reçoit un code de confirmation (format <code>DEL-…</code>) à conserver.
    Pour vérifier l'avancement, écrivez à agc@agc-assurances.com en citant ce code.<br>
    Each request receives a confirmation code (format <code>DEL-…</code>). Quote it in any follow-up e-mail.</p>
  </div>
  `
  return shell('Suppression des données', body)
}

module.exports = { privacyPage, deletionPage }
