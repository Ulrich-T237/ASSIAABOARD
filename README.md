# ASSIAA — Messenger channel (AGC Facebook Page)

The **third channel** of the same assistant. The WhatsApp bot (Baileys + MongoDB) and the
web assistant stay untouched: this service only transports messages between Meta and the
pipeline that already knows ASSIAA's script, her 10-item menu and AGC's 11 pages of memory.

```
Facebook Page ──webhook──▶ assiaa-messenger ──▶ pipeline (greeting · menu · flows · brain)
       ▲                                              │
       └────────────── Send API ◀──────────────────────┘
```

---

## What can be done **without** Page admin rights

Everything below works today, with a personal Facebook account and a temporary Page you
create yourself in 2 minutes (*Pages → Create → "ASSIAA test"*). Only the final switch onto
the official AGC Page needs AGC's approval.

| Step | Where | Time |
|---|---|---|
| 1. Create the Meta app (type **Business**) | developers.facebook.com → My Apps → Create app | 10 min |
| 2. Add the **Messenger** product to that app | App dashboard → Add product → Messenger | 2 min |
| 3. Copy **App ID** and **App Secret** | App settings → Basic | 2 min |
| 4. Invent a **VERIFY_TOKEN** (any long random string) | your `.env` on Render | 1 min |
| 5. Deploy this folder to Render, set the 5 env vars | Render → New Web Service | 10 min |
| 6. Paste `https://<service>.onrender.com/webhook` in Messenger → Webhooks, subscribe to `messages` + `messaging_postbacks`, click **Verify and Save** | app dashboard | 5 min |
| 7. Create your test Page, generate its **Page Access Token**, set `PAGE_ID` + `PAGE_ACCESS_TOKEN`, redeploy | app dashboard | 5 min |
| 8. Message your Page from your own account — she answers | Messenger | — |

> The webhook verification and the whole conversation are testable **before** any App
> Review: admins and testers of an app in Development mode get full behaviour.

---

## Endpoints

| Route | Purpose |
|---|---|
| `GET /webhook` | Meta handshake (`hub.challenge`), checked against `VERIFY_TOKEN` |
| `POST /webhook` | inbound events — signature **required** (`X-Hub-Signature-256`), answered in milliseconds, processed after |
| `POST /data-deletion` | Meta's signed callback → returns a `DEL-…` confirmation code |
| `GET /privacy` | privacy policy (FR + EN) — **required by App Review** |
| `GET /data-deletion` | deletion instructions (FR + EN) — **required by App Review** |
| `POST /api/simulate?token=…` | talk to the brain without Meta (only if `SIMULATE_TOKEN` is set) |
| `GET /api/health` | status + which credentials are missing |
| `GET /ping` | keep-alive for cron-job.org |
| `GET /` | one-page status card |

## Environment variables

| Variable | Required | Note |
|---|---|---|
| `GEMINI_API_KEY` | yes | same key as the other two services |
| `GEMINI_MODEL` | no | `gemini-3.5-flash-lite` by default |
| `FB_APP_ID` | no | for reference / diagnostics |
| `FB_APP_SECRET` | **yes** | used to verify every webhook signature |
| `VERIFY_TOKEN` | **yes** | must match the value typed in Meta |
| `PAGE_ACCESS_TOKEN` | **yes** | Messenger → Settings → Access tokens |
| `PAGE_ID` | no | the Page the token belongs to |
| `GRAPH_VERSION` | no | `v24.0` — bump if Meta answers "unknown version" |
| `HANDOVER_APP_ID` | no | `263902037430900` = Page Inbox (Meta Business Suite) |
| `ALERT_WEBHOOK_URL` | no | POSTed when a visitor asks for a human |
| `DRY_RUN` | no | `1` = never call Meta, log the replies instead |
| `SIMULATE_TOKEN` | no | secret for `POST /api/simulate` (route disabled if empty) |

Build: `npm install` · Start: `npm start` · Health: `/api/health`

## Test without Meta

```bash
cd assiaa-messenger
npm install
node scripts/test-messenger.js          # 65 checks, no network, no Meta, no Gemini
node scripts/simulate.js "Bonjour"      # the real conversation, replies printed
node scripts/simulate.js "devis"        # continues the same thread
node scripts/simulate.js --new "sinistre"
```

## Behaviour notes specific to Messenger

- **First message** greets in the visitor's own language (detected from the text), then
  attaches 4 quick replies to the menu so nobody has to type a number.
- **Per-PSID sessions**, 3 h TTL, one conversation processed at a time so replies never
  arrive out of order.
- **Echoes, read and delivery receipts are ignored**; duplicate `mid` values are dropped.
- **Attachments** (photo, voice note) get a polite answer with the adviser contact — the
  conversation never goes silent.
- **Handover**: "conseiller / agent / humain / advisor" passes the thread to the Page inbox
  and the bot stays silent until control comes back.
- **Messages longer than 2000 characters** are split on paragraph boundaries.

## What is deliberately NOT here

- No Baileys, no MongoDB, no WhatsApp session: those belong to the WhatsApp service.
- No page rendering, no widget: those belong to the web service.
- Nothing is shared through a database — the three services stay independent.
