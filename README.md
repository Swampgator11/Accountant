# Accountant

Connect **QuickBooks Online**, learn categories from your past books, and auto-categorize anything QuickBooks leaves uncategorized each morning.

## What it does

1. **OAuth connect** to your QuickBooks company (sandbox or production)
2. **Trains** on already-categorized purchases/deposits (merchant → account)
3. **Morning job** finds uncategorized entries, suggests categories, and optionally writes them back to QBO
4. Editable **rules** + heuristics as fallback when training has not seen a merchant
5. Monthly **Profit & Loss** from the QBO Reports API

Demo mode works out of the box with sample history — no credentials required.

> QuickBooks Online does **not** allow apps to log in with your email/password. You create Intuit Developer app credentials (Client ID / Secret), then approve access once via OAuth. After that, tokens refresh automatically.

## Quick start

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Try **Train on past entries**, then **Run morning job** in demo mode.

## Connect your QuickBooks account

1. Create an app at [Intuit Developer](https://developer.intuit.com/)
2. Enable the **Accounting** scope / QuickBooks Online API
3. Add redirect URI: `http://localhost:3000/api/auth/callback`
4. Copy **Client ID** and **Client Secret** into `.env.local`
5. Set a random `CRON_SECRET` for the morning webhook
6. Set `DEMO_MODE=false` and `QBO_ENVIRONMENT=sandbox` (or `production`)
7. Click **Connect QuickBooks** in the app and approve access

Tokens and the training model are stored locally in `.data/` (gitignored).

## Morning auto-categorization

The morning job:

1. Pulls historical categorized transactions from QBO
2. Rebuilds the training model (majority vote per vendor/description)
3. Finds uncategorized purchases/deposits
4. Suggests categories (training → rules → heuristics)
5. Auto-applies suggestions at or above your confidence threshold (configurable)

### Schedule it

Keep the app running (`npm run start` or your host), then cron:

```bash
# Every day at 7:00
0 7 * * * /path/to/Accountant/scripts/morning-run.sh >> /tmp/accountant-morning.log 2>&1
```

Or call the protected endpoint directly:

```bash
curl -X POST \
  -H "Authorization: Bearer $CRON_SECRET" \
  "$APP_BASE_URL/api/morning/run"
```

You can also click **Run morning job** in the UI anytime.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start local server |
| `npm run build` | Production build |
| `npm run start` | Serve production build |
| `npm test` | Unit tests (training + rules) |
| `npm run lint` | ESLint |
| `npm run morning` | Trigger morning job via cron script |

## Architecture

- `src/lib/qbo` — OAuth, API client, demo fixtures, P&L parsing
- `src/lib/categorization` — training model, rule engine, morning job
- `src/lib/storage` — local token / rules / training / run-log persistence
- `src/app/api` — Next.js route handlers (`/training`, `/morning`, …)
- `src/components/Dashboard.tsx` — UI
- `scripts/morning-run.sh` — cron helper

## Notes

- Training learns from **your** past categorizations, so recurring merchants (Starbucks → Meals, Adobe → Software, etc.) get handled automatically.
- Lower-confidence suggestions are left for review instead of being forced into QuickBooks.
- Production QBO apps require HTTPS redirect URIs and Intuit app review for distribution beyond your own company.
