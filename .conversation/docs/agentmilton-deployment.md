# AgentMilton setup and deployment

AgentMilton is a private, single-owner workspace. The current milestone includes
owner authentication, password change, and a protected readiness dashboard.
GitHub access, AI providers, repository editing, isolated test execution, and
approval-controlled Git operations are not enabled yet.

The GitHub account is authorized through the Replit-managed GitHub connection.
That connection is available to server-side code through Replit's connector
SDK; app-level repository browsing has not been implemented in this milestone.
Do not add a GitHub personal access token or OAuth secret to `.env`.

## Development configuration

The workspace provides PostgreSQL through `DATABASE_URL`. Keep local or
production credentials in Replit Secrets, not in source files:

- `SESSION_SECRET` — required for session-related security functions.
- `OWNER_BOOTSTRAP_PASSWORD` — one-time input used to create the initial owner
  password hash.
- `OWNER_USERNAME` — optional; defaults to the single owner configured for this
  app.

To initialize the development database schema, run:

```sh
pnpm --filter @workspace/db run push
```

The first request to `/api/auth/session` initializes the owner account if the
database does not contain one. Sign in with the configured owner credentials;
the initial password must be changed to a new password of at least 12
characters before the dashboard is available. After the account has initialized,
remove `OWNER_BOOTSTRAP_PASSWORD` from Replit Secrets. The stored password is a
salted scrypt hash; the application does not need the bootstrap secret for
subsequent sign-ins.

Run the application workflows:

```sh
pnpm --filter @workspace/api-server run dev
pnpm --filter @workspace/agentmilton run dev
```

## Replit deployment

1. Confirm the development database schema is up to date.
2. Add production `SESSION_SECRET` and `OWNER_BOOTSTRAP_PASSWORD` values through
   Replit Secrets. Keep provider credentials out of client-visible `VITE_*`
   variables.
3. Publish the `API Server` and `AgentMilton` web workflows together so the
   same-origin `/api` endpoints are available to the web app.
4. Sign in once, complete the required password change, and remove the
   bootstrap secret from Secrets.
5. Confirm unauthenticated requests see only the sign-in surface and that
   protected API requests return an authentication error.

Replit's Publish flow manages production schema changes for its built-in
PostgreSQL database. Review the schema diff shown during publishing; do not run
development `push` commands against production.

## Later integration configuration

The `.env.example` file lists the names used by later stages. Configure
OpenRouter, Gemini, or optional DeepSeek credentials only in Replit Secrets
when those provider integrations are implemented. GitHub authorization remains
managed by Replit. Execution isolation, resource limits, and approval gates
must be tested before enabling repository changes in a published instance.

## Security boundaries

- There is no registration flow or multi-user account surface.
- Login attempts are limited per HMAC-hashed client address and recorded in
  PostgreSQL.
- Session bearer tokens are random, stored only as SHA-256 hashes, and issued
  in HTTP-only cookies; production cookies use the secure flag.
- Password changes revoke every active owner session.
- Do not store real credentials in `.env.example`, source control, browser
  storage, or logs.
