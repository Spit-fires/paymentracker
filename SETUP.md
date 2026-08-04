# PaymentTracker — Utshaho Educare

Serverless payment tracking PWA. No backend — everything is stored in the teacher's own Google Drive.
The teacher signs in with a dedicated Google account, adds students (each gets a private Drive folder
shared view-only with the student), records payments, and the app generates a clean printable
**৳ receipt PNG** each time.

**Who does what**

| Person | Work |
|---|---|
| **You** (once, ~10 min) | Google Cloud setup (done) + embed Client ID in `src/config.ts` (done) + deploy (done) |
| **Teacher** (ever) | Tap **Sign in with Google** once, then use the app. Nothing else. |

## Stack

- Vite + React + TypeScript + Tailwind CSS v4
- Dexie (IndexedDB) for the offline mirror + sync outbox
- Google Identity Services (popup OAuth, `drive.file` scope) + Drive REST API
- `html-to-image` for receipt PNG export
- `vite-plugin-pwa` — installable on Android ("Add to Home Screen"), works offline

## 1 · Google Cloud setup — you, once

Do this on the dedicated account so the teacher's data lives under their own Drive.

1. Sign in to the **dedicated** Google account (create it if needed).
2. Go to [console.cloud.google.com](https://console.cloud.google.com) → **Create Project** → name it `PaymentTracker`.
3. **APIs & Services → Library** → search **Google Drive API** → **Enable**.
4. **APIs & Services → OAuth consent screen**:
   - User type: **External** → Create.
   - Fill app name (`PaymentTracker`) + the teacher's email as support/contact.
   - Skip scopes, add the teacher's email as a **test user**.
   - **Publish app** to Production. Google shows "unverified" — fine for a personal app.
     Publishing avoids the 7-day refresh-token expiry that Testing mode enforces.
5. **APIs & Services → Credentials → Create Credentials → OAuth Client ID** → **Web application**:
   - Authorized JavaScript origins: `http://localhost:5173` **and** your GitHub Pages URL
     (for this repo: `https://spit-fires.github.io/paymentracker/`).
   - Create, then copy the **Client ID** (ends in `.apps.googleusercontent.com`).
6. **Paste the Client ID into `src/config.ts`** (the `CLIENT_ID` constant) — already done with your Client ID.
7. Build + deploy (section 3) — already done via the Actions workflow on `main`.

That's the whole one-time setup. The teacher never touches any of this.

## 2 · Run locally

```bash
pnpm install
pnpm dev          # opens http://localhost:5173
```

Click **Sign in with Google** and use the dedicated account. Google shows an "unverified app"
warning the first time — accept it once (Advanced → Go to PaymentTracker (unsafe)).

## 3 · Deploy to GitHub Pages — done

The repo is live at **https://github.com/Spit-fires/paymentracker** and the app is deployed to
**https://spit-fires.github.io/paymentracker/**. Pushing to `main` auto-deploys via
`.github/workflows/deploy.yml` (builds with pnpm, then `actions/deploy-pages`).

**Important:** the deployed URL must be added to the OAuth client's *Authorized JavaScript origins*
in Google Cloud (Settings → the OAuth Client ID → add `https://spit-fires.github.io/paymentracker/`).

Local build for manual verification:

```bash
pnpm build        # outputs to dist/
```

The app uses `base: './'` + hash routing, so it works from any subpath.

## 4 · Teacher install on Android — teacher does nothing special

1. Open the deployed HTTPS URL in **Chrome** on the teacher's phone.
2. Tap **Sign in with Google** (once — after that it opens straight to the dashboard).
3. First time only, Google shows *"Google hasn't verified this app"* — that's Google's own
   screen for any unverified app and cannot be removed without paid verification. Tap
   **Advanced → Go to PaymentTracker (unsafe)** once. No effect on the app itself.
4. Menu → **Add to Home screen** (or Chrome offers "Install app").
5. It opens full-screen, offline-capable, with its own icon.

## What lives where in Drive

```
PaymentTracker/            root (created automatically on first login)
├── _meta.json             receipt counter + center profile
├── _students.json         student registry
├── _payments.json         full payment ledger
└── Students/
    └── <Batch> - <Name>/  shared view-only with the student's email
        ├── photo.jpg
        └── 0042-2026-08-04.png   (receipt PNGs)
```

All edits are written to IndexedDB immediately (so the app works offline) and pushed to Drive in the
background. On the Settings page you can force a sync, download a full JSON backup, restore one,
and export monthly/all payments as CSV.

## Notes

- Receipts are in English with ৳ amounts and Taka-in-words; the center name/address/phone shown on
  receipts are editable in **Settings → Center profile**.
- Folder sharing needs a real Google address for the student; sharing is silently retried on sync.
- v1 is single-teacher (last-writer-wins); keep backups enabled.
