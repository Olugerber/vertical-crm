# Deployment Overview — VerticalCRM

## Architecture

```
┌─────────────────────────────────────────────────┐
│                   Railway                        │
│                                                  │
│  ┌──────────────┐    ┌──────────────────────┐   │
│  │  Frontend    │    │    Backend (Node.js)  │   │
│  │  (static     │───▶│    Express + Prisma   │   │
│  │   serve)     │    │    Port 3001          │   │
│  └──────────────┘    └──────────┬───────────┘   │
│                                 │                │
│                      ┌──────────▼───────────┐   │
│                      │   PostgreSQL (Pg)     │   │
│                      │   Railway managed     │   │
│                      └──────────────────────┘   │
└─────────────────────────────────────────────────┘
```

## Services

| Service | URL | Notes |
|---------|-----|-------|
| Backend | `https://vertical-crm-production.up.railway.app` | Express API |
| Frontend | `https://radiant-magic-production-5a91.up.railway.app` | React SPA (static serve) |
| Database | Railway internal PostgreSQL | Exposed via proxy for local seed |

## Repository Layout

```
verticalCrm/                  ← repo root (Railway root dir = empty)
├── nixpacks.toml             ← build/install/start overrides
├── railway.json              ← Railway deploy config (backend)
├── package.json              ← root deps (codascon domain package)
├── src/verticalCrm/         ← domain code (codascon)
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── migrations/      ← applied via `prisma migrate deploy`
│   ├── src/
│   │   ├── server.ts
│   │   ├── routes/
│   │   ├── services/
│   │   ├── middleware/
│   │   └── seed/
│   └── package.json
└── frontend/
    ├── src/
    └── package.json
```

## Build Pipeline (nixpacks.toml)

```toml
[phases.install]
cmds = [
  "npm ci",              # installs root deps (codascon domain)
  "cd backend && npm ci" # installs backend deps
]

[phases.build]
cmds = ["cd backend && npx prisma generate"]

[start]
cmd = "cd backend && npx prisma migrate deploy; npx tsx src/server.ts"
```

The frontend is deployed as a separate Railway service using its own Vite build.

## Environment Variables

### Backend service

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `PORT` | Port to listen on (Railway sets this automatically) |

### Frontend service

| Variable | Description |
|----------|-------------|
| `VITE_API_URL` | Backend base URL (baked in at Vite build time) |

> `VITE_API_URL` must be set **before** the build runs (Railway build env var, not a runtime var).

## Database Migrations

Migrations live in `backend/prisma/migrations/`. They are applied automatically on each deploy via `prisma migrate deploy` in the start command.

To create a new migration locally:
```bash
cd backend
npx prisma migrate dev --name <migration-name>
```

To apply migrations against Railway DB directly:
```bash
cd backend
DATABASE_URL="<railway-postgres-url>" npx prisma migrate deploy
```

## Local Development

```bash
# Terminal 1 — backend
cd verticalCrm/backend
cp .env.example .env          # set DATABASE_URL to local Postgres
docker compose up -d          # or use local Postgres
npm install
npx prisma migrate dev --name init
npx tsx src/seed/demo.ts      # basic seed
# or:
npm run seed:demo             # full sales demo seed
npm run dev                   # → http://localhost:3001

# Terminal 2 — frontend
cd verticalCrm/frontend
npm install
npm run dev                   # → http://localhost:5173
```

The frontend dev server proxies `/api` to `http://localhost:3001` via `vite.config.ts`.

## Demo Seed

Run once to populate the Railway database with realistic demo data:

```bash
cd backend
DATABASE_URL="<railway-postgres-url>" npm run seed:demo
```

This creates:
- Org: `org-acme-sales` (Acme SaaS Inc)
- 5 users with different roles (Admin, SalesManager, AE×2, Compliance)
- 25 opportunities spread across all pipeline stages
- 5 quotes requiring approval (≥20% discount)
- Compliance-gated outbound events and audit entries

## Default Demo Headers

The frontend defaults to these headers (set via `localStorage` or hardcoded defaults):

```
X-Org-Id:    org-acme-sales
X-User-Id:   user-sm
X-User-Roles: SalesManager
```

To test admin features, change `X-User-Roles` to `Admin` in your browser's localStorage or the Admin page.

## Health Check

`GET /api/health` → `{ status: "ok" }`

Railway uses this endpoint for health monitoring. It is intentionally declared before auth middleware so it never requires credentials.
