# App Review submission kit — `pages_messaging`

Fill this in, record the screencast, paste, submit. Nothing here needs the official AGC Page:
use your test Page while the permission is pending, then switch the Page ID.

---

## 1. Before you click Submit

- [ ] The webhook is **Verified** in Messenger → Webhooks.
- [ ] `/privacy` and `/data-deletion` open publicly (no login, works on a phone).
- [ ] Both URLs are pasted in App settings → Basic (**Privacy Policy URL**, **Data Deletion Instructions URL**).
- [ ] The app has been tested end-to-end from an account that is **not** an admin (add a tester, or your second account).
- [ ] You have a screencast under 3 minutes, one continuous take, no edits.
- [ ] You wrote the reviewer test path (below) and it works exactly as written.

## 2. Screencast script (2–3 minutes, one take)

| Time | What you show | Say (or subtitle) |
|---|---|---|
| 0:00 | The AGC Page, "Send message" button | "This is the Facebook Page of AGC, the Cameroonian insurer." |
| 0:10 | Send **"Bonjour"** | "A visitor starts the conversation." |
| 0:20 | Greeting + 10-item menu appear | "ASSIAA greets the visitor and shows the ten services, in the language of the visitor." |
| 0:35 | Tap **"1️⃣ Automobile"** | "The visitor picks a service. This is a menu answer, no AI involvement." |
| 0:50 | Type **"devis"**, then answer the 4 questions | "A quote request is collected step by step: product, name, city, details." |
| 1:15 | The `DEV-…` reference appears | "AGC receives the request with a reference; a counsellor calls back." |
| 1:30 | Type **"sinistre"**, describe a loss | "A claim is recorded the same way." |
| 1:50 | Type **"je veux parler à un conseiller"** | "At any moment the visitor can ask for a human; the thread moves to the Page inbox." |
| 2:10 | Show the Business Suite inbox receiving it | "A person takes over. The bot stops answering." |
| 2:20 | Switch to English: **"I need a quote"** | "The assistant answers in the visitor's language." |
| 2:30 | End | "That is the whole scope: messages to the Page, answered by AGC's assistant." |

Do **not** show unrelated pages, unrelated apps, ads, or anything that is not the scope of
`pages_messaging`. Reviewers reject what they cannot map to the permission requested.

## 3. Submission text (paste in "Explain how your app uses this permission")

> ASSIAA is the virtual adviser of Assurances Générales du Cameroun (AGC), a Cameroonian
> insurance company. This app answers messages that customers send to the official AGC
> Facebook Page.
>
> `pages_messaging` is used for exactly two things:
> 1. **Receiving** the messages customers send to the Page (webhook `messages` and
>    `messaging_postbacks`), and
> 2. **Replying** in the same conversation through the Send API.
>
> What the assistant does with a message:
> - It greets the customer and shows a menu of AGC services (motor, health, travel, home,
>   other products, quote, claim, health card, branches, hours).
> - It answers questions using content published on agc-assurances.com.
> - When the customer asks for a quote or declares a claim, it collects the necessary
>   details, gives a reference (e.g. DEV-2026-1234), and informs the customer that an AGC
>   counsellor will call back.
> - When the customer asks for a human, it passes the conversation to the Page inbox
>   (`pass_thread_control`) and stops replying.
>
> It never contacts people proactively, never sends marketing or promotional messages,
> never sends messages outside the 24-hour window, and never uses message tags.
>
> Personal data: only the message content and the Page-scoped user ID, kept in memory for
> 3 hours and erased automatically. Our privacy policy: `<PRIVACY URL>`; deletion
> instructions: `<DELETION URL>`.

## 4. Reviewer test path (paste in "Steps to reproduce")

> 1. Open the Facebook Page: `<PAGE URL>`.
> 2. Click **Send message**, then send `Bonjour`.
> 3. The assistant replies with a greeting and a numbered menu of 10 items.
> 4. Send `1` → the motor insurance section is returned.
> 5. Send `devis` → the assistant asks: which product, your name, your city, and an
>    optional detail. Answer all four; a reference `DEV-<year>-<number>` is returned.
> 6. Send `sinistre` → the assistant asks for a description, a city and a policy number;
>    a reference `SIN-<year>-<number>` is returned.
> 7. Send `je veux parler à un conseiller` → the assistant confirms the transfer and the
>    conversation moves to the Page inbox.
> 8. Send `Hello` to start again in English.
>
> No login, no purchase, no payment is required to complete any of these steps.

## 5. After submitting

- Do **not** change app settings, privacy URLs or the webhook while in review: it restarts
  the 20-day clock.
- Screenshot the "In review" status and store it with the submission text.
- If rejected, fix exactly the named problem and resubmit **once** — each rejection
  re-queues the app, and about five in a row can block submissions for a week.
