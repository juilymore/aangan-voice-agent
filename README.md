# Aangan Voice Agent

An AI phone assistant for Aangan Studio, Pune. It answers every enquiry call at any hour, checks fit against Nikhil's rubric, and books consultations with Ruhi or Jay. Each call then becomes a designer brief, an email, a HubSpot deal, and a row on the dashboard.

## Documents (`docs/`)
| File | Role |
|---|---|
| `functional_design.md` | **Source of truth for qualification rules**: the budget check, temperature, agent lines, and the 40-row test table. It stands in for `qualification_logic.md`. |
| `build_spec.md` | The technical specification and the checkpoint plan. |
| `vaani_agent_prompt.md` | The system prompt for the voice agent and the tool definitions (v3). |
| `qualified.md`, `services.md`, `pricing.md` | Aangan's own source documents. `pricing.md` is used only on the server. |
| `enquiries_sep2026.txt` | The 40 anonymised September enquiries, used as test fixtures. |
| `vaani_openapi_v1.yaml` | The Vaani Labs public API contract as of 8 Oct 2026. |

## Stack
- Next.js 16 (App Router, TypeScript)
- Neon Postgres + Drizzle
- zod for validation
- Our own login: bcrypt plus a signed cookie, for 3 users
- Vercel for hosting
- An external scheduler that calls `/api/cron/*` with `CRON_SECRET`

Every external service has a mock (`MOCK_*=true`). These are the defaults, and tests never touch real services.

## Local setup
```bash
npm install
cp .env.example .env.local      # then fill in DATABASE_URL, SESSION_SECRET, SEED_*
npm run db:migrate              # creates the tables on Neon
npm run db:seed                 # creates Ruhi, Jay, Nikhil
npm run dev                     # http://localhost:3000
```

## Checks
```bash
npm test          # unit tests (vitest)
npm run typecheck
npm run lint
```

## Checkpoints
1. **Foundation**: schema, login, provider interfaces and mocks, Vercel deploy ← *current*
2. Rules engine plus the test table
3. Post-call pipeline (mock mode) plus fixtures
4. Dashboard
5. Google Calendar plus the 4 tool endpoints
6. Vaani wiring
7. Resend plus HubSpot
8. Hardening plus a runbook

## Known gaps (Vaani Labs)
The public docs, checked on 8 Oct 2026, confirm signed `call.completed` webhooks. They do **not** document mid-call custom HTTP tools, a list-calls endpoint, or the fields of `call.completed`, and phone numbers are masked. Until these are confirmed, the system runs the spec's fallback: no live tools, and a "needs scheduling" queue. See `lib/voice/vaani-adapter.ts`.

**Update (9 Oct 2026):** the Vaani agent builder (Persona tab) has a section called "Actions: System & Custom Tools (Functions)". Mid-call custom tools are therefore likely supported. The exact request and response format still needs to be confirmed.
