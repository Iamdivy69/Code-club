# CodeClub

A standalone React and TypeScript platform with a Fastify API, PostgreSQL and Prisma, Redis for shared execution capacity, and a Judge0 adapter. The interface uses the DSA V2 navigation, theme tokens, typography, and solver layout. The schema includes DSA V2's baseline migrations followed by additive practice, learning, competition, placement, and community migrations.

## Repository and current scope

Repository: [Iamdivy69/Code-club](https://github.com/Iamdivy69/Code-club).

The current local candidate has 267 published problems: 17 executable original exercises and 250 imported problems available for reading and editing. Imported Run/Submit remain disabled while controlled runtime verification is incomplete. The DSA V2 merge and payment gateways are outside this standalone release.

A fresh clone seeds the 17 original exercises. The approved catalogue source, hidden cases, credentials and database backups are intentionally kept in ignored local storage. To reproduce catalogue publication after preparing the approved source, follow [catalogue preparation](integration/catalogue/PREPARATION.md) and the read/edit publication instructions in [the handoff](integration/standalone/HANDOFF.md). Historical verification reports under `integration/` describe their recorded candidates; they are not a substitute for checks on later changes.

Prerequisites: Node.js 24 LTS (or another version accepted by `package.json`), npm, and Docker Desktop/Compose. Commit environment templates only; create local `.env` values before startup.

## Run with Docker Compose

Create `.env` in the repository root from `.env.example`. Set `JWT_SECRET` to a random value of at least 32 characters. Set `PRACTICE_SEED_PASSWORD` to at least 12 characters to create the local `student@practice.test` sign-in.

```powershell
docker compose up -d --build --wait
```

Open [CodeClub](http://127.0.0.1:3010). The [backend health endpoint](http://127.0.0.1:5010/api/practice/health) reports database and Judge0 configuration. Compose applies the Prisma migrations before the API starts. PostgreSQL data persists in the `practice_postgres` volume.

Set `JUDGE0_API_URL` in the root `.env` to enable Run, Submit, and the compiler. Use an HTTPS Judge0 endpoint or a local Docker Desktop host endpoint such as `http://host.docker.internal:2358/submissions`. For local development with the public Judge0 CE instance, set `JUDGE0_API_URL=https://ce.judge0.com/submissions?wait=false` and leave both token settings empty. Run and Submit send code and test inputs to this endpoint. Recreate the API with `docker compose up -d api` after changing its environment. [Judge0 CE API documentation](https://ce.judge0.com/docs)

Use `docker compose logs api migrate web` to inspect startup. Stop the stack with `docker compose down`.

## Run locally with Node.js

1. Use Node 22.12+ LTS and run `npm ci`.
2. Run `docker compose up -d postgres redis`, or point the app to separate PostgreSQL and Redis instances.
3. Copy `backend/.env.example` to `backend/.env`. Set `DATABASE_URL`, a random `JWT_SECRET` of at least 32 characters, and a local `PRACTICE_SEED_PASSWORD` of at least 12 characters. Point `JUDGE0_API_URL` to a trusted Judge0 `/submissions` endpoint. Set `JUDGE0_API_KEY` for a self-hosted authentication token or `JUDGE0_RAPIDAPI_KEY` for the RapidAPI gateway.
4. Run `npm run db:generate`, `npm run db:migrate`, and `npm run db:seed`. Existing standalone databases should apply the migrations before reseeding.
5. Run `npm run dev:api` and `npm run dev` in separate terminals. Open [http://127.0.0.1:3010](http://127.0.0.1:3010).
6. Sign in as `student@practice.test` with the seed password or create an independent account on the local development server.

The Compose setup uses ports 3010 for the frontend, 5010 for the API, 15432 for PostgreSQL, and 16379 for Redis. Browsing works before Judge0 is configured. Code execution requires a Judge0 endpoint.

Set `PRACTICE_STAFF_PASSWORD` before seeding to create local `teacher@practice.test`, `recruiter@practice.test` and `admin@practice.test` accounts. The admin approves recruiter applications. The teacher manages cohorts under the seeded university. In **Placement teams**, a super admin can select a university and designate a verified teacher as its lead. Leads add verified teachers from that university, transfer leadership and remove secondary members. Teachers can request placement access from **Officer verification** and add supporting evidence. Super admins make decisions under **Officer reviews**. The first approved officer becomes lead when that position is open. Team members manage university cohorts. Teachers outside the team retain access to classes they own. Candidates control profile publication and recruiter discovery in Profile settings, including availability, preferred role, and expected graduation. Approved recruiters can combine those filters with a verified university, topic, language, and solve range in the XP-ranked candidate directory. Students can also choose to share progress in university reports. Placement team members and super admins can open **Readiness reports**, filter assignments by date, and download a PDF.

## Standalone verification and password recovery

CodeClub can send verification and password reset links using the DSA SMTP settings. On the standalone server, set `PRACTICE_ACCOUNT_EMAIL_ENABLED=true` and `EMAIL_ENABLED=true`, then configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`, and `FRONTEND_URL`. Set `FRONTEND_URL` to the standalone site's base URL. Production requires HTTPS. Set `PRACTICE_PUBLIC_SIGNUP_ENABLED=true` to allow production signups after SMTP is configured.

With account email enabled, standalone accounts must verify their email address before signing in. Verification links expire after 24 hours and password reset links after one hour. Password reset clears all active standalone sessions for that account. An existing frontend session can renew its access token at rollout using its current refresh cookie. Embedded Practice uses the DSA host's auth routes and session.

## Standalone Google sign-in

Create a Google OAuth web client for the standalone CodeClub site. Register the site origin followed by `/api/auth/google/callback` as an authorized redirect URI. Set `FRONTEND_URL` to that origin and put `PRACTICE_GOOGLE_CLIENT_ID` and `PRACTICE_GOOGLE_CLIENT_SECRET` in the backend environment. Use HTTPS for the deployed site. For local development, register the exact loopback origin and port you use. Leaving both credentials blank disables Google sign-in. [Google web server OAuth setup](https://developers.google.com/identity/protocols/oauth2/web-server)

Users with an existing account sign in first, then open **Sign-in methods** and choose **Connect Google** using their verified CodeClub email. Connections retain the original user's role, progress, and institutional access. For new production accounts, set `PRACTICE_PUBLIC_SIGNUP_ENABLED=true`. CodeClub accepts verified Gmail and Google Workspace addresses for new accounts. With other email domains, it sends a separate CodeClub verification link and prompts the user to verify before signing in. [Google's verified email rules](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token)

## Notifications and reminders

The Practice inbox shows placement team updates, officer decisions, and class assignment notices. Teachers can send reminders from an open cohort’s assignment list, view each student’s remaining problems, and archive assignments while keeping their completion history. Compose starts the reminder worker once migrations finish. It checks every five minutes for assignments due within 24 hours and skips students who completed the work.

## LeetCode solve history

Open **Your practice → Profile → LeetCode solve history** to save manual counts, review and save fetched counts, or disconnect. Public profiles display the counts while published. Approved recruiters see them in candidate search when the learner opts into recruiter discovery. The page labels fetched and self-reported counts and flags fetched data after seven days. CodeClub calculates Practice progress, XP, rankings, and certificates from its own submissions and progress.

Username sync is optional. Set `PRACTICE_LEETCODE_STATS_URL` to an authorized backend stats provider using HTTPS. The service receives a GET request with a `username` query parameter and returns JSON with `username`, `easy`, `medium`, and `hard` fields. Set `PRACTICE_LEETCODE_STATS_TOKEN` if the provider requires a bearer token. The backend signs previews using the existing profile signing secret or the host's JWT signing key. Fresh installs offer manual entry with the provider URL left blank. Embedded Practice uses the same options in the DSA backend environment.

## Workspaces

| Path | Workflow |
| --- | --- |
| `/practice` | Catalogue, topic and progress filters, saved problems, and per-language Monaco editor drafts. Run visible or custom cases and Submit against the stored suite. Fifteen original exercises cover functions, linked lists, trees, matrices, graphs, and a design task. |
| `/practice/compiler` | Run standalone programs in the same six languages with optional standard input. |
| `/practice/dashboard` | Progress, examples of daily and weekly challenges, daily quiz, learning paths, notes, playlists, leaderboards, profile sharing, and verifiable printable certificates. |
| `/practice/certifications` | Ten topic certifications with fixed solve targets, authenticated PDF download, and a QR code linking to the public record. |
| `/practice/verify/:id` | Public certificate verification, including previously issued practice-path certificates. |
| `/practice/leaderboard` | Global and college rankings for public practice profiles, sorted by XP and solved count. College rankings require a verified email and an active DSA university enrollment. |
| `/practice/competitions` | Scheduled contests and invite-only battle lobbies with team assignment, host-controlled starts, and points from verified submissions. Public creation requires verified organizer access. Verified organizers can also select published contest-only problems for scheduled contests. |
| `/practice/placement` | Editable and archived class cohorts, CSV roster import, pending student seats, assignments and completion, recruiter approval, candidate discovery and in-app interest, timed skills tests. |
| `/practice/community` | Feature requests and votes, contribution and ambassador requests, referrals, opportunity listings, and rewards. The Super Admin view manages approvals, problem drafts and publication, rewards, and opportunities. |

The adapter uses Code Club's six Judge0 language IDs. It accepts immediate verdicts and submission tokens. Append `?wait=false` to the endpoint to select polling from the first request.

Set `REDIS_URL` and share `JUDGE0_SEMAPHORE_KEY` across replicas of the same deployment. Redis leases enforce `JUDGE0_MAX_CONCURRENCY` across those replicas. `JUDGE0_QUEUE_MODE=local` selects an in-process queue for a single API instance. `GET /api/practice/health` reports the coordination state.

Credits use the numeric amounts configured with `REWARD_AMOUNT_CONTRIBUTION_APPROVED`, `REWARD_AMOUNT_FEATURE_REQUEST_SHIPPED`, `REWARD_AMOUNT_REFERRAL_QUALIFIED_REFERRER`, and `REWARD_AMOUNT_REFERRAL_QUALIFIED_REFERRED`. An unset amount produces no grant. Staff must add items to the rewards store. Local signup and seeded credentials are for development.

## Practice activity report

In **Study → Profile**, choose **Download activity report** for your own practice totals, current and best streaks, strongest topics, and recent solves. The report is available with a private profile and before you set a public handle.

## Personal plans and PDF allowances

In **Study → Profile → Practice plans**, check your plan and available activity reports. Set `PRACTICE_BILLING_ENABLED=true` to enable one free activity report per UTC month. Super admins can grant and revoke membership from that page. An active grant allows unlimited activity reports. The allowance is disabled by default in development.

## Signed practice profiles

In **Study → Profile**, publish your profile, then choose **Sign profile** or **Download profile PDF**. The PDF includes a QR code that opens the public verification page. Making the profile private or changing its handle revokes the link. A signature with outdated totals remains readable until you sign the current totals.

Set `PRACTICE_PROFILE_SIGN_SECRET` to the same stable secret of at least 32 characters on all API replicas if verification links must survive JWT key rotation. Otherwise, signing uses the configured server JWT private key or secret. Keep the same proof signing secret if migrating existing proof records to the DSA host.

## Import a problem catalogue

An offline preview scans the folder layout used by Code Club and prints JSON with source digests, convertible languages, and review gaps.

```powershell
npm run --silent catalogue:import -- --source "D:/path/to/problem-bank" > catalogue-audit.json
```

A review manifest names a stable source and its version. Each approved entry records the reviewed digest, reviewer, and reuse rights.

```json
{
  "source": "approved-bank",
  "version": "revision-1",
  "entries": {
    "batch-total": {
      "approved": true,
      "reviewer": "Content owner",
      "rights": "Original problems authored for this project",
      "sourceDigest": "<copy the matching 64-character digest from the audit>"
    }
  }
}
```

Use `--manifest <reviews.json> --compare` to compare approved entries with the database named in `DATABASE_URL`. Use `--apply` to import eligible entries. New entries are drafts. Review and publish them from the Super Admin section of Community. Exact re-imports keep their version. To update an entry, review the changed files against a new manifest version and include `expectedContentVersion` from the database preview. Battle lobbies, scheduled competitions, and open assessments retain their pinned suite.

A reviewed `target` object with the existing DSA `id` and `slug` attaches the practice contract to that record. The mapper preserves the original DSA description, starter code, ownership, publication state, and progress. An optional `visualizerPath` records the verified host destination. The manifest may include `execution` overrides for `nativeSignature`, `designContract`, or `parameterOrder`, and an explicit `languages` list for reviewed starters.

### College cohort rosters

Verified DSA V2 teachers manage the Practice cohorts for their classes. The **College** view accepts a CSV with one email column and returns a result for each row. Files can include quoted fields and other columns. The importer accepts up to 2 MB and 10,000 rows. A teacher can also add one student or paste a list of email addresses.

Existing students are matched by their DSA university record. An eligible address can reserve a seat. The reservation becomes a class enrollment when a verified student from that university opens **Class assignments**. Archived Practice cohorts remain searchable and keep their roster and reports. Class records and attendance stay available in the DSA V2 workspace.

### Weighted index tests

A design contract can set `weightedSampling` with a zero-argument integer method and the index of its integer-array constructor argument. Use `{"distribution":"weighted-indices"}` as the expected value for cases that check a distribution. The driver makes 8,192 draws. Run shows counts by index, and Submit applies the same grader to the stored hidden cases. Use an ordinary results array for deterministic cases.

The local fixture library includes **Weighted Ticket Draw** and **Minimum Stack Checkpoints**, each available in all six supported languages.

### Contest-only problems

Set `contestOnly: true` in a problem draft or `"visibility": "contest"` in reviewed source metadata. Publish the dedicated problem from the Super Admin problem bank. Publish places it in the verified organizer’s scheduled contest picker. It stays out of practice catalogues, playlists, challenges, and assessments.

The contest organizer can preview the problem after adding it to a schedule. Joined participants get solver access when the contest opens. After the contest ends, signed-in users can use its direct link. A scored submission appears on the contest leaderboard and in the submitter’s history.

## Verification and integration

- `npm run contracts:check` validates the shared DTO copies.
- `npm run build` compiles the client and API.
- `npm test` tests Judge0 transport, drivers, and comparison behavior. Include the PostgreSQL tests by migrating a disposable loopback database named `practice_test` and setting `PRACTICE_TEST_DATABASE_URL`.
- Set `PRACTICE_TEST_REDIS_URL=redis://127.0.0.1:16379` to run the shared-capacity and lease recovery tests against disposable Redis.
- Set `PRACTICE_LIVE_JUDGE0_URL` to run synthetic programs in all six languages, including the tree reference, codec, and C matrix cases. For a protected endpoint, set `PRACTICE_LIVE_JUDGE0_TOKEN` or `PRACTICE_LIVE_JUDGE0_RAPIDAPI_KEY`.
- The [feature parity record](integration/codeclub-parity.md) tracks completed and remaining behaviors against the pinned Code Club source and REA evidence.

The [DSA V2 integration kit](integration/frontend/README.md) installs both halves of Practice into the pinned hosts. It uses DSA V2’s navigation, theme, sessions, Prisma client, and Redis service. The [build plan](DSA-V2-Practice-Platform-Build-Plan.md) tracks the release and migration gates.


## Standalone candidate 0.2.0-rc.1

See [manual-test handoff](integration/standalone/HANDOFF.md) for verified scenarios, remaining release gates and restore instructions. This candidate stays standalone; neither DSA host is modified.

- Signed-out visitors can follow **Read public problems** on sign-in. The reader lists only explicitly published, ordinary Practice material. Open a problem while connected, then keep the page open for offline reading. Fresh HTML navigation needs a connection. Reconnection refreshes or removes withdrawn material. Account changes clear reader caches.
- The dashboard warm-up uses 120 original questions across 15 topics, with an immutable daily snapshot at IST boundaries. **Skip for today** records a skip independently of a wrong answer. Staff dashboards omit the warm-up. Quiz outages do not block ordinary dashboard access.
- **CodeClub Editions** has two chapters of four missions drawn from the original exercise library and three upcoming chapters. Accepted solutions unlock missions in order. Bindings use UUIDs, so a rename preserves progress. Withdrawn problems cannot start new missions.
- Super admins open **Community → Settings** for maintenance, recruiter and placement officer application controls, and a public announcement. Stale concurrent edits require a reload. Administrators retain access during maintenance.
- **Community → Accounts → Preview Practice reset** shows the affected account and counts. The operator enters a reason and types `RESET PRACTICE`. The transaction restarts personal Practice XP, streaks and daily/weekly/Edition challenge progress, and retains submission history, issued certificates, assignment completions and native DSA progress. Repeating the same request returns the same audit receipt. Development verification uses disposable learners only.

The 250 reviewed reference exercises are published for reading and editing. Their execution is disabled until controlled verification is commissioned; the 17 original exercises retain Run/Submit. Do not configure public Judge0 for that catalogue's hidden cases. [Preparation and outstanding fixture coverage](integration/catalogue/PREPARATION.md).

For isolated Compose projects, override `PRACTICE_WEB_PORT`, `PRACTICE_API_PORT`, `PRACTICE_POSTGRES_PORT` and `PRACTICE_REDIS_PORT`, and use a distinct `-p` project name. Existing demo defaults and storage are retained. `PRACTICE_STAFF_PASSWORD` also creates `officer@practice.test` with placement team access in local fixture databases.

Run `npm run release:candidate` after the final build to reproduce the code/configuration SHA-256 inventory. Credentials, local provider fixtures, database dumps and catalogue hidden data live outside that inventory in ignored `.local` storage.
