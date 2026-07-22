# Accountant

Connect **QuickBooks Online**, auto-categorize transactions with rules, and generate monthly profit & loss reports.

## What it does

1. **OAuth connect** to your QuickBooks company (sandbox or production)
2. **Pulls uncategorized purchases/deposits** from QBO
3. **Suggests categories** using editable regex rules + merchant heuristics
4. **Writes categories back** to QuickBooks (when connected)
5. **Generates a monthly P&L** from the QBO Reports API and exports CSV

Demo mode works out of the box with sample data — no credentials required.

## Quick start

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Connect your QuickBooks account

I cannot log into your QBO company from this environment. You connect once via OAuth:

1. Create an app at [Intuit Developer](https://developer.intuit.com/)
2. Enable the **Accounting** scope / QuickBooks Online API
3. Add redirect URI: `http://localhost:3000/api/auth/callback`
4. Copy **Client ID** and **Client Secret** into `.env.local`
5. Set `DEMO_MODE=false` and `QBO_ENVIRONMENT=sandbox` (or `production`)
6. Click **Connect QuickBooks** in the app and approve access

Tokens are stored locally in `.data/` (gitignored).

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start local server |
| `npm run build` | Production build |
| `npm run start` | Serve production build |
| `npm test` | Run categorization unit tests |
| `npm run lint` | ESLint |

## Architecture

- `src/lib/qbo` — OAuth, API client, demo fixtures, P&L parsing
- `src/lib/categorization` — rule engine + heuristics
- `src/lib/storage` — local token/rules persistence
- `src/app/api` — Next.js route handlers
- `src/components/Dashboard.tsx` — UI

## Notes

- Auto-categorization starts with sensible defaults (SaaS, travel, meals, ads, utilities, etc.). Edit rules in the **Rules** tab.
- In demo mode, apply is preview-only and does not mutate QuickBooks.
- Production QBO apps require HTTPS redirect URIs and Intuit app review for distribution beyond your own company.
