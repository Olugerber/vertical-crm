# Security Overview — VerticalCRM

## Authentication Model

VerticalCRM uses a **header-based multi-tenant simulation** suitable for demo and internal tooling. Each request must include:

| Header | Description | Example |
|--------|-------------|---------|
| `X-Org-Id` | Organization identifier | `org-acme-sales` |
| `X-User-Id` | User identifier | `user-sm` |
| `X-User-Roles` | Comma-separated roles | `SalesManager,Admin` |

Requests missing `X-Org-Id` or `X-User-Id` receive `401 Unauthorized`.

> **Production note:** Replace header auth with JWT/OAuth2 (e.g. Auth0, Cognito) before exposing to the public internet. The middleware is isolated in `backend/src/middleware/auth.ts` — swap the implementation there.

## Role-Based Access Control

Roles are enforced at the route level:

| Role | Permissions |
|------|-------------|
| `AE` (Account Executive) | Read/write leads, opportunities, quotes, contacts |
| `SalesManager` | All AE permissions + advance stages to ClosedWon |
| `Compliance` | Read audit log, log compliance events |
| `ComplianceOfficer` | All Compliance permissions + override authority |
| `Admin` | All above + admin console (org, policy, users) |

Admin routes (`/api/admin/*`) are protected by `adminGuard` middleware (`backend/src/middleware/adminGuard.ts`) which checks for the `Admin` role.

## Policy-Driven Authorization (codascon)

Business-rule authorization is enforced by the **codascon double-dispatch engine**, not by ad-hoc `if` statements. Every CRM event goes through:

1. **`ValidateCrmEvent`** — evaluates the event against the active `VerticalPolicy` config:
   - Stage transition rules (required fields, allowed paths)
   - Approval rules (discount thresholds, required approver roles)
   - Compliance rules (consent status, DNC flags, channel restrictions)
2. **`ApplyCrmEvent`** — writes the state change only if validation passed

If no policy is configured, all events return `POLICY_NOT_CONFIGURED` and are blocked. This is **fail-closed** by design.

### What the Policy Controls

```json
{
  "stages": ["Prospect","Qualified","Proposal","Negotiation","ClosedWon","ClosedLost"],
  "transitions": { "Prospect": "Qualified", ... },
  "approvalRules": [
    { "condition": "discountPercent >= 20", "requiredRoles": ["SalesManager"] }
  ],
  "complianceRules": {
    "outboundChannels": ["Email","Phone","SMS","InPerson"],
    "requireConsent": true,
    "blockOnDnc": true
  }
}
```

Policies are versioned, immutable once activated, and every enforcement decision is written to the audit log with the policy ID and version.

## Audit Trail

Every CRM event produces an `AuditEvent` record containing:
- `who` — user ID
- `what` — event type (e.g. `STAGE_TRANSITION`, `OUTBOUND_CONTACT_ATTEMPTED`)
- `when` — ISO 8601 timestamp
- `beforeStageKey` / `afterStageKey` — for stage changes
- `entityType` / `entityId` — the affected entity
- `policyId` / `policyVersion` — the policy that evaluated the event

Audit events are **append-only** (no update/delete endpoints). The audit log is exportable as CSV via `GET /api/audit/export.csv`.

## Multi-Tenancy Isolation

Every database query is scoped to `orgId` from `req.auth.organizationId`. There is no cross-org data access path. The Prisma schema enforces this at the model level — every tenant-scoped model has a non-nullable `orgId` foreign key.

## Data in Transit

- Backend-to-Railway DB: TLS-encrypted PostgreSQL connection (Railway enforces TLS)
- Frontend-to-backend: HTTPS (Railway terminates TLS)

## Known Limitations (for production hardening)

1. **No token-based auth** — header spoofing is trivial; add JWT validation
2. **No rate limiting** — add express-rate-limit or an API gateway
3. **No input sanitization library** — Prisma parameterizes queries (SQL injection safe), but add Zod schema validation for all request bodies
4. **Secrets in env vars** — DATABASE_URL is in Railway env (correct); rotate credentials regularly
5. **No audit log integrity protection** — consider append-only storage or cryptographic chaining for tamper-evidence in regulated industries
