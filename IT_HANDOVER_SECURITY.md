# GDC Workforce Planning Platform — IT Security Handover Notes

## What has been implemented (application layer)

- **Dual-mode auth middleware** — dev bypass + production JWT/JWKS stub (Task 1)  
  `backend/middleware/auth.js` reads `AUTH_MODE` at startup. In dev mode the server
  logs a console warning and injects a demo user. In production mode it validates a
  signed JWT Bearer token against a JWKS endpoint, extracting `id`, `name`, `email`,
  and `role` from standard OIDC claims.

- **httpOnly cookie session — wired, awaiting production config** (Task 2)  
  `cookie-parser` is registered in `backend/server.js`. The `IT_HANDOVER` comment in
  that file lists the three steps needed to move token storage from `localStorage` to
  a `httpOnly; Secure; SameSite=Strict` cookie.

- **Strict Content Security Policy via Helmet** (Task 3)  
  `backend/server.js` now enforces `default-src 'self'`, `frame-ancestors 'none'`,
  `object-src 'none'`, `upgrade-insecure-requests`, HSTS (1 year + preload), and
  `referrer-policy: strict-origin-when-cross-origin`.

- **SQL injection audit — all 16 route files confirmed clean** (Task 4)  
  See audit results below.

- **Least-privilege DB user script** — for IT to run once (Task 5)  
  `backend/db/setup-db-permissions.sql`

- **Row-Level Security scripts and pool annotation** (Task 6)  
  `backend/db/setup-rls.sql` + `IT_HANDOVER` comment in `backend/db/pool.js`

- **Audit log extended to cover TBH codes, hire requests, people, and all admin actions** (Task 7)  
  `backend/db/auditLog.js` — standalone `writeAudit` helper wired into:  
  `tbhCodes.js` (CREATE / UPDATE / DELETE)  
  `hireRequests.js` (CREATE / APPROVE / REJECT)  
  `people.js` (CREATE / UPDATE / PERMANENT_DELETE)  
  `admin.js` (all write routes — users, regions, disciplines, levels, contract types,
  planning years, hierarchy config, finance settings, change request rules)

- **Secrets audit — git history is clean** (Task 9)  
  No `.env` files were ever committed. No hardcoded credentials found in any commit.
  `.env` and `.env.local` are correctly listed in `.gitignore`.

---

## What IT must complete before go-live

### 1. SSO Configuration
Set `AUTH_MODE=production` and configure the three JWKS variables in Railway / vault:

```
AUTH_MODE=production
AUTH_JWKS_URI=https://<equinix-idp-domain>/.well-known/jwks.json
AUTH_AUDIENCE=<your-api-identifier>
AUTH_ISSUER=https://<equinix-idp-domain>/
```

The JWKS URI is provided by Equinix IT / Auth0 / Okta during SSO onboarding.  
Adjust the role claim name in `backend/middleware/auth.js` (marked `IT_HANDOVER`).

### 2. httpOnly Cookies
Follow the `IT_HANDOVER: Token storage` comment in `backend/server.js`:

1. On login success: `res.cookie('token', jwt, { httpOnly: true, secure: true, sameSite: 'Strict', maxAge: 3600000 })`
2. Update `frontend/src/hooks/useAuth.ts` — remove `localStorage` token storage; rely on the cookie being sent automatically.
3. Update `frontend/src/services/api.ts` — add `withCredentials: true` to the axios instance.

### 3. Least-privilege Database User
Run `backend/db/setup-db-permissions.sql` against the production PostgreSQL database
(substitute `<APP_DB_PASSWORD>` with a password from your secrets manager), then
update `DATABASE_URL` in Railway to use `app_user` instead of the admin user.

### 4. Audit Log — New Columns
The `writeAudit` helper (`backend/db/auditLog.js`) inserts into additional columns.
Run the following migration once against the production database:

```sql
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS user_email  TEXT;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS action       TEXT;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS table_name   TEXT;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS record_id    INTEGER;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS old_values   JSONB;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS new_values   JSONB;
```

Until these columns exist, `writeAudit` calls will fail silently (by design — audit
failures never crash the application). The existing `req.auditLog` middleware continues
to write to the original columns throughout.

### 5. Row-Level Security (Staging first)
Review and test `backend/db/setup-rls.sql` in a staging environment before applying
to production. Read the `IT_HANDOVER` comment in `backend/db/pool.js` for the
request-scoped middleware required to set RLS session variables.

### 6. Dependency Vulnerability Audit
`npm audit` could not run from this machine — the corporate SSL certificate intercepts
outbound TLS to `registry.npmjs.org`. Run the following from a machine with direct
registry access or via CI:

```bash
cd backend  && npm audit --audit-level=high
cd frontend && npm audit --audit-level=high
```

Apply safe fixes with `npm audit fix`. List breaking-change fixes separately for
review before applying with `npm audit fix --force`.

### 7. Content Security Policy — Post-build Tightening
The CSP currently allows `'unsafe-inline'` in `styleSrc` to support the existing
inline styles used throughout the React frontend. Once the frontend build is finalised,
remove `'unsafe-inline'` if styled-components or Tailwind are replaced with static CSS.  
Add Equinix CDN / Anaplan / Workday domains to `connectSrc` if those APIs are called
directly from the browser.

### 8. Log Forwarding
Configure Railway's log drain to forward application logs to the Equinix SIEM / Splunk
instance. All sensitive operations (auth failures, audit writes, startup config) are
already emitted via Winston JSON logs.

### 9. Penetration Test
Recommended scope: authentication bypass, IDOR (insecure direct object references),
privilege escalation, injection, CSRF, session fixation.

### 10. Data Residency
Confirm that the Railway production region is compliant with GDPR for EMEA employee
data stored in the PostgreSQL database.

---

## SQL Injection Audit Results

All 16 route files in `backend/routes/` were checked. Every `pool.query` call uses
parameterised `$N` placeholders. No user input is concatenated into query strings.

| File | Status | Notes |
|---|---|---|
| allocations.js | ✅ Clean | Dynamic WHERE built with $N params |
| admin.js | ✅ Clean | Dynamic SET list uses $N params |
| changeRequests.js | ✅ Clean | Template literals interpolate pre-defined server-side constants only |
| comments.js | ✅ Clean | |
| countryAllocations.js | ✅ Clean | |
| dashboard.js | ✅ Clean | |
| gearing.js | ✅ Clean | |
| headcount.js | ✅ Clean | `${SELECT_PERSON}` is a module-level constant; user id via $1 |
| hireRequests.js | ✅ Clean | Dynamic column names (`stage${n}_user_id`) derived from DB integer, not user input |
| imports.js | ✅ Clean | |
| people.js | ✅ Clean | Dynamic WHERE and SET built with $N params |
| personComments.js | ✅ Clean | |
| planningCycles.js | ✅ Clean | |
| projects.js | ✅ Clean | |
| smartsheet.js | ✅ Clean | |
| tbhCodes.js | ✅ Clean | |

---

## Environment Variables Required for Production

| Variable | Description |
|---|---|
| `AUTH_MODE` | Set to `production` |
| `AUTH_JWKS_URI` | Equinix IdP JWKS endpoint |
| `AUTH_AUDIENCE` | API identifier registered in IdP |
| `AUTH_ISSUER` | IdP issuer URL |
| `DATABASE_URL` | Connection string using `app_user` (not admin) |
| `NODE_ENV` | Set to `production` |
| `COOKIE_SECRET` | Random 32-byte hex — generate with `openssl rand -hex 32` |
| `CORS_ORIGIN` | Restrict to your production domain (currently defaults to `*`) |

---

## Development Workflow After These Changes

- `AUTH_MODE` is not set (or set to `dev`) in your local `.env` — the bypass remains active.
- All existing features and routes continue to work unchanged in dev mode.
- The new security scaffolding is completely inert in dev mode and activates only when
  `AUTH_MODE=production` is set in the deployment environment.
- The startup warning `⚠️  AUTH_MODE=dev — authentication is bypassed` is expected during
  local development and will disappear once production variables are set.
