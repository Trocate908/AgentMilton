# AgentMilton

A private, owner-only coding workspace for inspecting and safely improving the owner's GitHub projects.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server
- `pnpm --filter @workspace/agentmilton run dev` — run the AgentMilton web app
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required server configuration: `DATABASE_URL`, `SESSION_SECRET`, and the temporary `OWNER_BOOTSTRAP_PASSWORD` until the first owner record is created. `OWNER_USERNAME` defaults to the one configured owner.
- See `.env.example` and `docs/agentmilton-deployment.md` for setup and deployment.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Web: React, Vite, TypeScript, Tailwind CSS
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/agentmilton/` — private owner sign-in, dashboard, GitHub browser, task queue, and settings
- `artifacts/api-server/src/routes/` — API routes; OpenAPI contracts live in `lib/api-spec/openapi.yaml`
- `lib/db/src/schema/` — Drizzle schema for the single owner account, database-backed sessions, and login throttling
- `docs/agentmilton-deployment.md` — owner setup and Replit deployment instructions

## Architecture decisions

- The owner password is hashed server-side and the initial password is forced to change before dashboard access.
- Sessions and login-attempt windows persist in PostgreSQL; browser cookies are HTTP-only and secure in production.
- OpenRouter is the only AI API integration. Do not add direct Gemini or DeepSeek providers unless the owner asks.
- Repository text sent to OpenRouter is limited, filtered for sensitive files, and redacted for likely secrets.
- Repository code is not executed in this runtime. Tests remain blocked, so commit, push, and pull-request actions stay unavailable.
- Use the already-authorized Replit GitHub connection from server-side code through its connector SDK. Never store GitHub access tokens or expose them to the browser.
- The current artifact scaffold uses React/Vite with the shared Express API; it is not a Next.js app.

## Product

The app provides owner-only authentication, GitHub repository browsing, OpenRouter model settings, and coding tasks that produce reviewable drafts. It does not execute repository code; tests are blocked and Git writes beyond draft-branch creation are unavailable until a supported sandbox exists.

## User preferences

- Keep this application private and limited to one owner; do not add registration or additional user accounts.
- Use OpenRouter only for AI calls until the owner asks to add another provider.
- Never commit credentials, API keys, or `.env` files. Do not claim repository tests or pushes are available.

## Gotchas

- The first request to `/api/auth/session` creates the single owner record from `OWNER_BOOTSTRAP_PASSWORD` if it does not already exist.
- Remove `OWNER_BOOTSTRAP_PASSWORD` from Replit Secrets immediately after first-time setup. The app stores only the derived password hash.
- New password changes require at least 12 characters and revoke all active sessions.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
