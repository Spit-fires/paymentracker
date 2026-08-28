# Payment Tracker — Utsaho Educare

Tuition center payment tracker PWA for **Utsaho Educare** (Fahad Hossain — https://fh.js.cool). Tracks students, monthly fees, receipts, attendance, routines, and accounting. Offline-first, syncs via Google Drive.

## Stack
- **React 19** + **Vite 8** + **Tailwind 4** + **Dexie 4** (IndexedDB) + **react-router 7** (HashRouter) + **motion** + **chart.js**
- PWA (`vite-plugin-pwa` + `workbox-window`), `modern-screenshot` + `html-to-image` for receipt PNG capture
- Rich text: custom `contentEditable` (`src/components/RichEditor.tsx`) — `document.execCommand` with selection persistence + tap-misfire guard, toolbar: bold/italic/underline/strike, size, color, align, bullet/ordered, clear
- Deploy: Vercel auto-deploys `main`; hard-refresh PWA after deploy

## Repo
- `https://github.com/Spit-fires/paymentracker.git` — branch `main`
- Local: `C:\Users\USER\paymentracker`

## Core Concepts
- **Invoice No**: `DDMMYYUE##` (`UE` fixed, `##` = `dailySeq` per-day, padded 2, resets daily) via `fmtInvoiceNo` in `src/lib/format.ts`
- **Receipt No**: global `receiptNo` (internal sequential, file names); `dailySeq` is display-only
- **Message tokens**: `{student} {period} {center} {date} {batch} {link} {routine} {routine date} {routine day}` — `date` is today for reminders, payment date for receipts
- **School**: `Student.school?: string` + `Student.ssacId?: string` (only when `school === 'SSAC'`). Not indexed, no Dexie bump. `SCHOOLS = ['SSAC']` + dynamic schools derived from `students` distinct values. `Other` → free text, becomes future option. `None — no school` clears both.
- **Student photo**: `photoBlob` + `photoFileId` (Drive). Sync clears stale blob when `photoFileId` changes; Students list + detail fetch missing pics (max 8). Receipt shows portrait: ratio-aware `max 80x80`, `object-fit: contain`, no head crop, no stretch, fits `480` width
- **Scroll restore**: per-page `sessionStorage` + `pos.current` map, `useNavigationType` POP vs PUSH, module-level `savedScrollY` for Students, `getY()/setY` robust (`window.scrollY || pageYOffset || documentElement.scrollTop`), `requestAnimationFrame` + `setTimeout` single attempt
- **Dexie**: v4 — `students: 'id, batch, archived'`, `payments: 'id, studentId, receiptNo, period'`, `postings: 'id'`, `attendance: 'id, studentId, day, batch'`, `routines: 'id, day, batch'`, `outbox: '++id, at'`

## Project Structure
```
src/
  App.tsx              — HashRouter, AnimatedRoutes (motion.div pageVariants, AnimatePresence mode="wait"), scroll logic, WelcomeBack
  index.css            — theme tokens, app-shell, receipt print styles
  types.ts             — Student (school? ssacId? photoBlob?), Payment (dailySeq?), Center (routineMsg?), etc.
  lib/
    db.ts              — Dexie 4, K keys, getKV/setKV (localStorage pt_kv), queueOp
    sync.ts            — studentSig (includes school/ssacId), paymentSig, pull/merge LWW, defaultCenter
    format.ts          — fmtInvoiceNo, fmtTaka, takaToWords, fmtDate, periodLabel, fillMessage, dayKey, etc.
    phone.ts           — waLink, waPhone, openExternal
    logs.ts, token.ts, ledger.ts, drive.ts
  state/AppContext.tsx — NewStudentInput (school/ssacId), addStudent/updateStudent, dailySeq backfill, center migration
  components/
    RichEditor.tsx     — custom contentEditable, sanitizeHtml, toolbar, selection persistence
    ReceiptCard.tsx    — 480 fixed, invoice, student photo portrait, amount panel, PAID stamp, rules
    StudentForm.tsx    — name/phone/batch chip + new batch, school dropdown (SSAC + dynamic + Other → text), SSAC ID conditional
    Layout.tsx, ui.tsx, Logo.tsx, anim.ts
  pages/
    Students.tsx, StudentDetail.tsx, Payment.tsx, ReceiptView.tsx, ReceiptLookup.tsx, Settings.tsx, Accounting.tsx, Attendance.tsx, Routines.tsx, Login.tsx, Lock.tsx, Dashboard.tsx
```

## Key Workflows
- **DB**: `pnpm build` (`tsc -b && vite build`) → `pnpm lint` (oxlint, 12 warnings ok) → commit (no push until user says)
- **Do not push** until explicitly requested (Vercel auto-deploys)
- **Center phone migration**: `migrateLegacyPhone` in AppContext
- **Receipt capture**: `modern-screenshot` + fallback `html-to-image`, inline styles for PNG

## Completed (recent)
- Custom RichEditor with selection persistence + tap-misfire guard (reverted from Lexical/Quill/CKEditor attempts)
- School dropdown (SSAC only + dynamic), SSAC ID conditional, strict display-only, optional, no index
- Student photo on receipt 58×72 → 80×80 ratio-aware portrait, top-center, contain, no crop
- Scroll restore: robust getY/setY, sync save on row click, module-level, POP-only, single attempt
- Invoice `DDMMYYUE##`, per-day `dailySeq`, backfill/dedup, CSV export
- Splash “Welcome back” + portfolio link, footer link, Send Routine, Payment Remind, batch/status filters

## Next / Known
- School save sync: ensure `initial` → form sync when Modal reuses instance (fixed via `useEffect` on `initial.id`)
- RichEditor: keep custom, do not reintroduce package (Lexical/Quill/CKEditor all had picker/clip/focus issues)
- Receipt photo: ratio-aware sizing must stay within `480×` card, `max 80`, `contain`, no receipt growth

## Commands
- `pnpm dev`, `pnpm build`, `pnpm lint`, `pnpm preview`
- `git status --short`, `git diff --stat`, `git log --oneline -10`
