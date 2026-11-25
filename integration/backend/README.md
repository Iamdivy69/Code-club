# DSA V2 backend installation

This kit installs the standalone Fastify Practice modules in the pinned DSA Visualiser Backend. The revision is in `integration/baseline.json`. The DSA server provides the existing login, session refresh, Prisma client, authorization rules, and Redis service.

## Preview and apply

Run this from the CodeClub root against a disposable archive or checkout of the pinned DSA backend revision. The [combined installer](../frontend/README.md#preview-and-apply) can apply the frontend and backend together.

```powershell
node integration/backend/install.mjs --target 'D:/path/to/dsa-backend'
node integration/backend/install.mjs --target 'D:/path/to/dsa-backend' --apply
node integration/backend/install.mjs --target 'D:/path/to/dsa-backend'
```

The preview reports each path, its operation, and the expected SHA-256 digest. It checks the revision when Git metadata is available, along with the host app, auth middleware, dependency lockfile, schema, and base migration hashes. An installed preview should report zero changes. Use a fresh pinned checkout to resolve a drift error.

From the target repository's `backend` package, install the pinned dependencies, regenerate Prisma Client, and build. Point Prisma at the intended database before applying the normal DSA migration deployment command.

```powershell
npm ci
npm run db:generate
npm run build
npm exec -- prisma migrate deploy
```

For catalogue import, use the CodeClub CLI from the standalone root with `DATABASE_URL` pointing to the disposable host database and a reviewed UUID and slug mapping. The [standalone import instructions](../../README.md#import-a-problem-catalogue) cover the preview and apply commands.

The installer creates `backend/.env.practice.example`. With `PRACTICE_ENABLED=false`, `GET /api/practice/availability` reports disabled. After migrations and fixture or reviewed catalogue import, set `PRACTICE_ENABLED=true` and restart the backend. The Practice API uses the host's normal bearer token and refresh cookie. Archiving a Practice cohort creates a separate record linked to the DSA class. The original class and its enrollments remain available through the host class routes. The existing signup transaction records a valid Practice referral when the flag is enabled. The account still requires the host’s normal approval.

## Judge0 and the local Docker demo

Set `JUDGE0_API_URL` to the approved Judge0 `/submissions` endpoint. The transport accepts synchronous responses and asynchronous submission tokens. Set the matching optional API key and use a distinct `JUDGE0_SEMAPHORE_KEY` for separate environments sharing one Redis instance. `GET /api/practice/health` reports configuration and queue status. An authored Run and Submit smoke test verifies execution.

The official Judge0 CE 1.13.1 deployment requires cgroups v1. The Windows Docker Desktop engine used during this rehearsal reports cgroups v2. Use a Judge0 host that meets the official release prerequisites or an approved HTTPS deployment. [Judge0 CE release](https://github.com/judge0/judge0/releases/tag/v1.13.1) · [Judge0 WSL2 issue](https://github.com/judge0/judge0/issues/603)

## Reminder worker

From the installed DSA backend package, run `node dist/modules/practice-platform/placement-reminders.js` with the deployment’s `DATABASE_URL` and `PRACTICE_ENABLED=true`. Run one sweep from a scheduler or pass `--watch` to check every five minutes. The worker records automatic delivery with the assignment and can run alongside normal API requests.

## Rehearsal and rollback

`verify.mjs` exercises the built host API in four phases. Run the baseline phase with the original compiled host after its migrations. Install the feature, apply the fourteen Practice migrations, regenerate Prisma Client, build and seed the original Practice fixtures. Then run the enabled, disabled, and restored phases in sequence. Use a disposable loopback database named `practice_merge_<id>`, a dedicated local Redis database, `NODE_ENV=test`, and a fixture-only `PRACTICE_REHEARSAL_PASSWORD`. Keep the same fixture record path across phases. From the CodeClub root, use `npm run db:seed` with the same disposable `DATABASE_URL` and a fixture-only `PRACTICE_SEED_PASSWORD`.

```powershell
node integration/backend/verify.mjs baseline 'D:/path/to/dsa-backend' 'D:/path/to/fixture.json'
node integration/backend/verify.mjs enabled 'D:/path/to/dsa-backend' 'D:/path/to/fixture.json'
node integration/backend/verify.mjs disabled 'D:/path/to/dsa-backend' 'D:/path/to/fixture.json'
node integration/backend/verify.mjs restored 'D:/path/to/dsa-backend' 'D:/path/to/fixture.json'
```

The enabled phase uses a loopback Judge0 fixture to prove the Run and Submit flow, Redis leases, stored verdicts, and DSA progress. The disabled phase verifies that existing routes work and stored Practice rows persist. For rollback, set `PRACTICE_ENABLED=false` and restart the backend. Keep the additive migration history and resulting data. Restore access by setting the flag to true and restarting.
