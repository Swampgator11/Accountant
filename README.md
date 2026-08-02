# Accountant

Connect **QuickBooks Online**, learn categories from your past books, and auto-categorize anything QuickBooks leaves uncategorized each morning.

## What it does

1. **Credentials login** — paste your Intuit Client ID / Secret in the app
2. **OAuth connect** to your QuickBooks company
3. **Trains** on already-categorized purchases/deposits
4. **Morning job** finds uncategorized entries and writes high-confidence categories back
5. Monthly **Profit & Loss** from the QBO Reports API

## Deploy on Vercel (recommended)

```bash
npx vercel
```

Then in the Vercel project → Settings → Environment Variables, set:

| Name | Value |
| --- | --- |
| `APP_SECRET` | long random string |
| `CRON_SECRET` | long random string |
| `DEMO_MODE` | `false` |

Open the deployed URL → **Add credentials** → paste Client ID / Secret → copy the shown **Redirect URI** into your Intuit app → **Connect QuickBooks**.

No localhost needed. Vercel Cron hits `/api/morning/run` daily (see `vercel.json`).

## Local development

```bash
npm install
cp .env.example .env.local
npm run dev
```

Use the same credentials login screen, or put values in `.env.local`.

## Intuit setup

1. Open your app at [Intuit Developer](https://developer.intuit.com/)
2. Copy **Client ID** and **Client Secret**
3. Add the Redirect URI shown in Accountant (on Vercel it looks like `https://your-app.vercel.app/api/auth/callback`)
4. Use **Production** keys for live books

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Local server |
| `npm run build` | Production build |
| `npm test` | Unit tests |
| `npm run lint` | ESLint |

## Architecture

- `src/components/CredentialsForm.tsx` — credentials login
- `src/lib/qbo` — OAuth + QBO API client
- `src/lib/categorization` — training, rules, morning job
- `src/lib/storage` — encrypted cookie store on Vercel, `.data/` locally
- `vercel.json` — daily morning cron
