# VerticalCRM — Policy-Driven CRM Engine

A CRM platform where every business action (stage transitions, approvals, compliance checks) is enforced by a versioned **VerticalPolicy** config rather than hard-coded rules. Built on the **codascon** double-dispatch pattern.

## Live Demo

| Service | URL |
|---------|-----|
| Frontend | https://radiant-magic-production-5a91.up.railway.app |
| Backend API | https://vertical-crm-production.up.railway.app |

**Demo credentials** (pass as headers or use the frontend defaults):
```
X-Org-Id:    org-acme-sales
X-User-Id:   user-sm
X-User-Roles: SalesManager
```

## How It Works

```
HTTP Request
    │
    ▼
Auth Middleware (X-Org-Id / X-User-Id / X-User-Roles)
    │
    ▼
Route Handler → eventDispatcher.dispatch()
                    │
                    ├─ 1. Load VerticalPolicy from DB
                    ├─ 2. Build CrmStateSnapshot from Prisma
                    ├─ 3. ValidateCrmEvent.run()  ← codascon
                    │       └─ blockedReasons / missingFields / requiredApprovals
                    └─ 4. ApplyCrmEvent.run()     ← codascon (only if valid)
                            └─ Prisma writes + AuditEvent
```

Every decision is policy-driven and audit-logged. No policy configured = all events blocked (fail-closed).

## Sales Demo Flow

Run the seed first:
```bash
cd backend
DATABASE_URL="<railway-postgres-url>" npm run seed:demo
```

Then explore:

1. **Pipeline** — Kanban board with 25 seeded opportunities. Click "Advance →" to trigger stage validation. Click "Quote →" to view/edit a quote.

2. **Quote Approval** — Five opportunities in Negotiation have quotes with ≥20% discount. These require SalesManager approval. Try:
   - As `user-ae1` (AE role): submit a quote → it enters Pending state
   - As `user-sm` (SalesManager): approve or reject it

3. **Leads** — Create, assign, qualify (BANT checklist), or disqualify leads. Policy-blocked actions show inline validation errors.

4. **Contacts** — Manage consent status and DNC flags. The seed creates contacts in OptOut and Unknown states. Attempting outbound contact on them triggers compliance blocks.

5. **Audit Log** — Filter by entity type, entity ID, or date range. Export as CSV for compliance reporting.

6. **Admin Console** — (requires Admin role, use `user-admin` / `Admin` role):
   - View/edit org profile
   - View active policy, paste new policy JSON, click Validate & Activate
   - Manage users and roles

## Policy Config Format

```json
{
  "verticalKey": "saas-sales",
  "version": "1.0.0",
  "stages": ["Prospect","Qualified","Proposal","Negotiation","ClosedWon","ClosedLost"],
  "transitions": {
    "Prospect": "Qualified",
    "Qualified": "Proposal",
    "Proposal": "Negotiation",
    "Negotiation": "ClosedWon"
  },
  "requiredFieldsByTransition": {
    "Prospect->Qualified": ["budget","timeline"],
    "Qualified->Proposal": ["proposalSentDate"]
  },
  "approvalRules": [
    { "condition": "discountPercent >= 20", "requiredRoles": ["SalesManager"] },
    { "condition": "discountPercent >= 35", "requiredRoles": ["VP"] }
  ],
  "complianceRules": {
    "outboundChannels": ["Email","Phone","SMS","InPerson"],
    "requireConsent": true,
    "blockOnDnc": true
  }
}
```

## Security & Compliance Talking Points

- **Fail-closed policy enforcement** — if no policy is loaded, all mutations are blocked
- **Immutable audit trail** — every event writes an `AuditEvent` with actor, timestamp, policy ID + version
- **CSV audit export** — filterable by entity, actor, date range; suitable for compliance review
- **Role-based approval gates** — discount thresholds, deal values, and stage advances are role-gated via policy rules, not code changes
- **DNC & consent enforcement** — outbound contact attempts against opt-out or DNC contacts are blocked at the policy layer, not the UI layer

See [`docs/SECURITY_OVERVIEW.md`](docs/SECURITY_OVERVIEW.md) for full security details.

## Local Development

```bash
# Backend
cd backend
cp .env.example .env   # add DATABASE_URL
npm install
npx prisma migrate dev --name init
npm run seed:demo
npm run dev            # http://localhost:3001

# Frontend (separate terminal)
cd frontend
npm install
npm run dev            # http://localhost:5173
```

## Docs

- [Security Overview](docs/SECURITY_OVERVIEW.md)
- [Deployment Overview](docs/DEPLOYMENT_OVERVIEW.md)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Domain | codascon (double-dispatch event validation) |
| Backend | Node.js, Express, TypeScript, tsx |
| ORM | Prisma + PostgreSQL |
| Frontend | React, Vite, TypeScript, Tailwind CSS |
| Hosting | Railway (backend + DB + frontend) |
