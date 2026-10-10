# Aangan Voice Agent

**Live:** https://aangan-voice-agent-tawny.vercel.app · **Repo:** github.com/juilymore/aangan-voice-agent (private) · Deploys automatically from `main` (Git → Vercel only).

An AI phone assistant for Aangan Studio, Pune. It answers every enquiry call at any hour, checks fit against Nikhil's rubric and books consultations with Ruhi or Jay on one shared calendar. Every call then becomes a designer brief, an email, a HubSpot deal and a record on a studio-style dashboard.

```
Caller ──► Vaani agent ──(mid-call tools)──► /api/tools/{lookup_caller, check_fit, get_available_slots, book_consultation}
                │                                   rules engine · shared calendar · bookings (no overlaps)
                └──(call.completed webhook)──► /api/webhooks/vaani ──► store raw event ──► after():
                      redact → Gemini extraction (quotes verified) → rules → temperature → compliance → brief
                      → assign designer → sync jobs: designer email · HubSpot deal · escalation · price-leak alert
Dashboard (/, /calls, /calls/[id], /metrics) ◄── Neon Postgres ──► crons: reconcile (15 min), digest (08:00 IST), retention
```

## Status

| # | Checkpoint | State |
|---|---|---|
| 1 | Foundation: schema, persona switcher, providers and mocks | ✅ |
| 2 | Rules engine: 40/40 on the September fixtures | ✅ `npm run rules:report` |
| 3 | Post-call pipeline: real Gemini 39/40 (98%), 8/8 on hard exclusions | ✅ `npm run eval:gemini` |
| 4 | Dashboard: Today, Calls, Call detail, Metrics | ✅ |
| 5 | Calendar and the 4 tools | ✅ code done. Running on the mock calendar until Google is set up |
| 6 | Vaani wiring: webhook, tools, reconcile | ✅ code done. Needs a public URL (deploy), then registration in Vaani |
| 7 | Resend and HubSpot | ✅ code done. Email is mocked until `MOCK_EMAIL=false`; HubSpot needs a token |
| 8 | Hardening: failsafes, retention, runbook | ✅ Final real night-time call after deploy |

## Run it locally
```bash
npm install
npm run db:migrate        # tables on Neon (DATABASE_URL in .env.local)
npm run db:seed           # designers Ruhi and Jay
npm run demo:seed         # optional: the 40 September enquiries as demo calls (mock providers only)
npm run dev               # http://localhost:3000
```
Checks: `npm test` (165 tests) · `npm run typecheck` · `npm run lint` · `npm run test:fixtures` · `npm run eval:gemini` (real AI, costs a few paise).

`.env.local` explains every variable. Mock switches: `MOCK_VOICE`, `MOCK_CALENDAR`, `MOCK_AI`, `MOCK_EMAIL`, `MOCK_CRM`. A real provider with a missing key falls back to its mock. While `EMAIL_TEST_MODE=true`, every email goes only to `EMAIL_TEST_TO`.

## Go live, step by step

### 1. Put the app online (GitHub and Vercel)
1. Create an empty private GitHub repo, then run `git remote add origin <url>` and `git push -u origin main`.
2. In Vercel: **Add New → Project →** import the repo. Under **Environment Variables**, paste everything from `.env.local`, and set `APP_URL` to the Vercel URL. Deploy.
3. Open `https://<app>/api/health`. It should show `"ok": true`.
4. In GitHub: **Settings → Secrets → Actions**. Add `APP_URL` and `CRON_SECRET`. This enables the 15-minute reconcile job (`.github/workflows/reconcile.yml`). Vercel runs the daily digest and retention jobs from `vercel.json`.

### 2. Register the four tools in Vaani
In Vaani: **Persona → Actions → Custom Tools → Add Custom Tool**. Do this once per tool:

| Field | Value |
|---|---|
| Name | `lookup_caller` / `check_fit` / `get_available_slots` / `book_consultation` |
| API Endpoint | `POST https://<app>/api/tools/<name>` |
| Timeout | 2000 / 2500 / 6000 / 8000 ms |
| Headers | `x-aangan-tool-secret` = the `TOOL_SHARED_SECRET` value from `.env.local` |
| Parameters | As in `docs/vaani_agent_prompt.md` Part C, plus `call_id` if Vaani offers a call-id value |

The responses are flat JSON. Use "Store Fields as Variables" for `decision`, `ask`, `say`, `slots`, `success` and `spoken_confirmation` if the agent needs them as variables.

### 3. Register the post-call webhook
In Vaani: **Developers → Webhooks**. Add URL `https://<app>/api/webhooks/vaani` with events **call.completed** and **call.failed**. Copy the `vv_whk_…` secret into `VAANI_WEBHOOK_SECRET` (Vercel and `.env.local`), set `MOCK_VOICE=false`, then redeploy. Make one test call. If processing fails, check that payload under `raw_events` and adjust `lib/voice/vaani-adapter.ts` (`parseCallEvent`) to the real field names.

### 4. Shared Google Calendar
**Easiest (in use): iCal feeds, no Google Cloud.**
1. Google Calendar → Settings → the studio calendar → **Integrate calendar** → copy **Secret address in iCal format**. Put it in `GOOGLE_ICS_URL` in `.env.local` and in Vercel (Settings → Environment Variables), then push any commit to redeploy. Busy times, including bookings made through the Google appointment page, are then never offered to callers.
2. Google Calendar → **Other calendars → + → From URL** → paste the `CALENDAR_FEED_URL` noted at the bottom of `.env.local`. Consultations booked by the phone agent then appear in Google Calendar (Google refreshes subscribed calendars every few hours; the dashboard is always live).

**Alternative (instant two-way): Google service account**
1. In Google Cloud: create a project, enable the **Google Calendar API**, create a **service account**, and download its JSON key.
2. In Google Calendar: create "Aangan – Consultations". Open **Settings → Share with specific people**, add the service account email, and give it **Make changes to events**.
3. Set `GOOGLE_SERVICE_ACCOUNT_B64` (base64 of the JSON file) and `GOOGLE_CALENDAR_ID` (shown under "Integrate calendar"), then set `MOCK_CALENDAR=false`.

### 5. Email (Resend) and HubSpot
- **Email:** set `MOCK_EMAIL=false`. With `EMAIL_TEST_MODE=true`, everything still goes only to `EMAIL_TEST_TO`. Resend's test sender delivers only to your own Resend account email until a domain is verified.
- **HubSpot:** in a free HubSpot account, go to **Settings → Integrations → Private apps**. Use scopes `crm.objects.contacts.read/write`, `crm.objects.deals.read/write` and `crm.schemas.deals.write`. Put the token in `HUBSPOT_TOKEN`, run `npm run hubspot:setup` (it lists the stages and creates the `aangan_*` properties), then set `MOCK_CRM=false`.

## Runbook

| Situation | What happens automatically | What you do |
|---|---|---|
| A webhook is lost or processing fails | Raw event is stored; reconcile re-processes it within 15 minutes | Nothing. Check `raw_events.error` if it repeats |
| A duplicate webhook arrives | Ignored (unique event id) | Nothing |
| A tool times out mid-call | Agent proceeds (check_fit) or uses its calendar fallback line; logged in `tool_calls` | Post-call re-check flags anything wrong |
| Google Calendar is down | `get_available_slots` returns no slots; the agent notes preferred times; the lead lands in the follow-up queue | Book from the dashboard once it's back |
| Two callers grab the same slot | The database refuses the overlap; alternatives are offered | Nothing |
| Gemini returns bad output | Retried once, then marked `needs_review` with the transcript shown | Review the call |
| Gemini makes up a fact | Its quote isn't in the transcript, so the field is dropped and flagged | Fill it in on the call |
| The agent mentions a price | Critical compliance flag, immediate email to Nikhil, red banner | Fix the prompt, then re-test |
| The agent claims a booking that didn't happen | Critical flag | Designer calls the customer |
| Email or HubSpot fails | Retries at 1, 2, 4, 8, 16, 32 minutes, then a red "sync failed" badge | Press **Retry** on the call |
| A call drops | Linked to the call-back from the same number within 60 minutes; follow-up queue | Call back |
| No calls for 24 hours | The digest subject warns "phone line may be down" | Check Vaani and the number |
| A designer is on leave | Set `designers.active = false` | No slots or new leads go to them |

- **Add a designer:** add them to `config/team.ts` and to the seed list in `scripts/seed.ts`, then run `npm run db:seed`.
- **Rotate keys:** generate a new value, update Vercel and `.env.local`, and redeploy. For `TOOL_SHARED_SECRET`, also update the header in all four Vaani tools. For the webhook secret, re-register the webhook.
- **Delete a caller's data (DPDP):** run `npm run erase-caller -- "+91 …"`. It shows what it would delete; add `--yes` to delete. Remove the HubSpot contact and calendar event by hand.
- **Retention:** calls older than `RETENTION_MONTHS` (12) are deleted nightly.
- **Remove the demo data:** run `npm run demo:seed -- --clean`.

## Documents (`docs/`)
| File | Role |
|---|---|
| `functional_design.md` | Source of truth for the rules: budget check, temperature, lines, test table |
| `build_spec.md` | Technical spec and checkpoints |
| `vaani_agent_prompt.md`, `vaani_prompt_paste.txt` | Agent prompt (v3.1) and tool definitions |
| `vaani_guardrails.md`, `vaani_objection_handling.json` | Vaani guardrails and pain points |
| `rules_report.md` | The 40 enquiries, judged |
| `qualified.md`, `services.md`, `pricing.md`, `enquiries_sep2026.txt` | Aangan's source material |

## Design decisions that differ from the spec
- **Neon instead of Supabase,** and no logins: a "Viewing as" dropdown switches between Nikhil, Ruhi and Jay. Anyone with the URL can see calls, so keep the URL private or add a site password before sharing it.
- **One shared calendar:** a booked time blocks everyone, enforced by a Postgres `EXCLUDE` constraint. The designer is assigned per slot (random among those under their daily cap).
- **check_fit uses a deterministic parser** instead of an AI call. It's fast (under 0.3 s) and predictable, and the post-call pipeline re-checks with Gemini.
- **The brief and summary are built by code from verified facts only,** not written by the AI, so they can't invent anything.
- **Vaani has no list-calls API,** so reconcile re-processes stored-but-unfinished webhooks. A webhook that never arrived can't be recovered. Vaani retries failed deliveries 8 times over about 4 hours.
