# CodeClub standalone 0.2.0-rc.1

Prepared 22 November 2026; publication follow-up 25 November 2026 (IST). **Ready for manual testing as a synthetic-development candidate. The full catalogue release is not complete.** Neither real DSA V2 repository was changed.

- Candidate: http://127.0.0.1:34121
- Original demo, preserved separately: http://127.0.0.1:34120
- Credentials: ignored local file `.local/release/TEST-ACCOUNTS.txt`; excluded from this document and the source archive.
- Source archive: `.local/release/codeclub-standalone-0.2.0-rc.1-reading-20261125.zip`.
- Code/configuration SHA-256 revision: `df48a20118766571ac1e75a14a77cff6cf60de8aa0be4d79b7c076cbdc5a0a55`. [Exact file inventory](source-manifest.json).
- This checkout has no Git HEAD. The fingerprint identifies the uncommitted source snapshot; it is not a Git commit.

## What is in this candidate

The existing DSA UI and platform remain in place. Added 120 original warm-up questions across 15 topics; daily persisted snapshots, IST boundaries, skip records and concurrent first-result protection; a public-only offline reader with withdrawal/reconnect and account-switch cleanup; two original Edition chapters with eight UUID-bound missions and three upcoming chapters; structured contribution review, content reports, moderation removal and opportunity taxonomy/filters; audited operational controls; scoped progress reset; solve-first editorial and revoked-interview entitlement checks; and catalogue language filtering.

Reset retains submission history, certificates, recorded assignment completions and native DSA progress. Personal Practice XP, streaks, daily/weekly challenges and Edition progression restart. Grading uses reset revisions under the learner lock, so clock skew or timestamp ties cannot restore pre-reset personal progress. Legacy catalogue status can still show a retained native DSA solve; personal Practice XP and challenge completion use their separate records.

The manual library now contains **267 published problems: 17 executable original exercises and 250 read/edit-only imported problems**. Run, custom Run and Submit for imports are rejected before any judge call. [Publication evidence](../catalogue/publication-report.json) and [API/browser checks](publication-evidence/report.json). [Published IDs, versions, languages and grading digests](published-content.json). The verification learner already has an Accepted Count Above submission. Profiles and recruiter discovery remain private until the learner opts in. The recruiter fixture is approved; officer and teacher fixtures have their corresponding local access.

## Verification observed

| Check | Result |
| --- | --- |
| Contracts, frontend build and backend build | Passed |
| Final PostgreSQL/Redis regression run | 106 passed; 15 opt-in live checks skipped in that run |
| Separate live Judge0 run, original synthetic cases only | 15/15 passed across all six runtimes; [raw test report](live-judge0-report.json) |
| Combined distinct automated checks | 121 passed across those two runs |
| Actual Docker browser suite | 8 scenarios passed, zero page errors; desktop/mobile and both themes; [report](docker-evidence/report.json) |
| Dedicated offline-reader Chromium scenarios | 8 passed; [report](reading-evidence/report.json) |
| Community Chromium scenarios | 5 passed; [report](community-evidence/report.json) |
| Original Edition contracts on local runtimes | All 46 enabled language pairs passed; [report](../catalogue/edition-language-report.json) |
| Prepared reference fixtures on local runtimes | 52/52 pairs passed; [report](../catalogue/development-fixture-report.json) |
| Pristine Docker install | Healthy, all 50 migrations applied, learner sign-in passed |
| Restore and upgrade | Backup restored into disposable `practice_upgrade`; all 50 migrations applied, identities and original password hash matched before the disposable auth fixture |
| Actual candidate Run/Submit | Both sample cases passed; Submit Accepted, 4/4 stored original cases passed |
| Dependency audit | Zero reported vulnerabilities; [report](dependency-audit.json) |
| Compiled REA inspection | 15 files parsed, zero parse failures/invalid UTF-8; frontend semantic analysis was partial at its heap limit; [coverage](compiled-evidence.json) |

[Docker lifecycle evidence](docker-lifecycle.json) records original/restored counts and identity preservation. The original database contained 17 problems, one user, and no submissions/progress/certificates. Nonempty historical solve retention was separately verified in the catalogue import rehearsal and reset regressions.

## Release gates and remaining work

| Gate | Status |
| --- | --- |
| A: reviewed catalogue | **Open.** All 250 original digests match; 1,488 structurally compatible pairs. Accepted/wrong fixtures cover 52 pairs; **1,436 fixture pairs still require implementation**. No full controlled Judge0 matrix has run. These are separate implementation and infrastructure gaps. |
| A: fixture repairs/import | Two Sum and Min Stack defects repaired only in the derivative candidate. All 250 imports rehearsed as drafts, repeat import unchanged, UUIDs and nonempty prior solves preserved. All 250 are now published for browsing/editing; graded release remains disabled. |
| B: quiz/offline/Editions | Local API, browser and runtime checks passed. Original equivalents avoid copying unapproved quiz/Edition content. Full ten-track certificate completion still depends on enough reviewed, graded catalogue material being released. |
| C: scoped remaining administration/community/membership flows | Local implementation and regressions passed. [Community mapping](community-gap-matrix.md), [benefit/recruiter mapping](membership.md). Existing DSA light/dark themes are retained. |
| D: Docker/providers | Fresh install and disposable upgrade passed. Synthetic public Judge0 smoke passed. Optional live providers remain disabled; real SMTP/Google/AI/authorized stats staging checks require configuration. Full controlled catalogue execution and deployment-specific two-replica commissioning remain open. |
| E: handoff | This versioned source, local role accounts, checklist, provider report and restore instructions are ready for user testing. Resolve manual-test findings before any later DSA merge decision. |

The offline reader is a `noindex` utility. Authenticated workspaces and drafts are not emitted into a sitemap. Indexable catalogue landing pages/canonical metadata remain part of the unreleased catalogue work. Payment gateways and DSA merge work remain outside this candidate.

## Provider state

[Actual candidate status](provider-status.json): Judge0 uses the already configured public CE endpoint for the original synthetic library only. AI hints, coaching, mock interviews, weekly email delivery, account SMTP, Google OAuth and LeetCode sync are disabled. Manual LeetCode entry/disconnect remain available. Opportunity research has no configured AI provider. Scheduled weekly delivery stays off; ordinary assignment reminders retain their default worker.

Never enable execution of the approved catalogue on the public Judge0 endpoint. Publication is read/edit-only and does not authorize grading or hidden-case transmission. Use the controlled-endpoint procedure in [catalogue preparation](../catalogue/PREPARATION.md) and [verifier guide](../catalogue/README.md) when full fixture coverage and a controlled endpoint are available. Local compiler passes and the synthetic live smoke do not close catalogue acceptance.

The preserved demo's historical password hash is unchanged. Its current `.env` seed password does not match that account. Therefore upgrade authentication was tested with a temporary password only on the disposable restored copy, then its original hash was restored. The real demo account was not reset. Use the separately supplied candidate credentials for new manual testing.

## Manual test checklist

1. **Visitor:** open sign-in → Read public problems; browse only published material, open a statement and public certificate/profile links. Draft/contest reading links should not resolve.
2. **Learner:** sign in; combine search/topic/difficulty/language filters; open Count Above; Run, Submit, inspect history; answer or skip today's quiz and reload. Open Editions; verify sequential unlocks. Save a public problem, keep the reader open, go offline, reconnect, and clear saved material. Check notes, saved problems, profile visibility and manual external stats.
3. **Teacher/officer:** sign in separately; create a cohort, add a learner, assign an exercise and inspect completion. Test institution/officer review and access revocation using a fresh test learner if needed.
4. **Recruiter:** use the approved account. Have the learner explicitly publish and opt into discovery; search and send interest/a test. Withdraw consent and confirm new discovery/outreach is denied.
5. **Admin:** review a new contribution, report and remove a public feature/opportunity, inspect feedback and audit events. Change an announcement/application switches. Turn maintenance on and off from the same admin session. Preview/reset only a disposable learner; keep the receipt and confirm history/certificates/assignments/native progress survive.
6. **Failure/recovery:** disable execution temporarily only in the isolated candidate, verify a clear failure, and restore its configuration. Exercise disabled provider messages. Test desktop/mobile and dark/light. Report reproducible release-blocking findings before merge.

## Start/reproduce

The running candidate uses project `codeclub-clean`, ports web 34121/API 35010/PostgreSQL 35432/Redis 36379 and its own volume. The original `dsa-practice` project retains its independent storage and port 34120.

```powershell
Set-Location D:\PROJECTS\CodeClub
npm ci
npm run contracts:check
npm run db:generate
npm run build
# Full integration checks require migrated disposable practice_test + isolated Redis:
$env:PRACTICE_TEST_DATABASE_URL='postgresql://practice:local_practice@127.0.0.1:15432/practice_test?schema=public'
$env:PRACTICE_TEST_REDIS_URL='redis://127.0.0.1:16379'
npm test

docker compose -p codeclub-clean --env-file .local/rehearsal/clean.env config --quiet
docker compose -p codeclub-clean --env-file .local/rehearsal/clean.env up -d --build --wait
npm run release:candidate
```

The ignored local env file is machine-specific. On another machine, create it from `.env.example` with new JWT/seed/staff secrets, distinct ports and the selected synthetic Judge0 endpoint. Keep all optional live providers disabled until commissioned. The source ZIP contains templates and build instructions, not these secrets, database dumps or approved hidden fixtures.

Browser reproductions use `integration/standalone/verify-docker.mts`, `verify-reading.mts` and `verify-community.mts`. Set `PLAYWRIGHT_MODULE` to an installed Playwright `index.mjs` and `PLAYWRIGHT_EXECUTABLE` to its Chromium executable. Community tests require the disposable database. `verify-docker.mts` rejects the original demo port for mutation scenarios.

## Migrations and restore

New additive migrations beyond the 46-migration baseline:

- `202611210001_standalone_completion`
- `202611210002_standalone_editions_community`
- `202611220001_reset_epoch`
- `202611220002_submission_epoch`

Preserved original backup: `.local/backups/before-standalone-20261121.dump`. It is a PostgreSQL custom-format dump; it is ignored and excluded from the ZIP. Restore only into a separate disposable database/project for rehearsal. The observed rehearsal used these exact targets:

```powershell
docker exec codeclub-clean-postgres-1 createdb -U practice practice_upgrade
docker cp .local/backups/before-standalone-20261121.dump codeclub-clean-postgres-1:/tmp/codeclub-upgrade.dump
docker exec codeclub-clean-postgres-1 pg_restore -U practice -d practice_upgrade --exit-on-error /tmp/codeclub-upgrade.dump
docker compose -p codeclub-clean --env-file .local/rehearsal/clean.env run --rm -e 'DATABASE_URL=postgresql://practice:local_practice@postgres:5432/practice_upgrade?schema=public' migrate npm run db:migrate
```

Use a newly named empty disposable database if repeating. Do not restore this dump over the original database. The temporary upgrade API and fresh-install project are stopped after verification; their isolated storage is retained. The manual candidate and original demo stay available. Stop a project with `docker compose -p <project> ... down`; ordinary `down` retains its database volume.


## Publication follow-up · 25 November 2026

The user requested publication. All 250 approved entries were imported and published for browsing and editing, giving 267 visible problems. Execution for imported catalogue entries fails closed in the service and is visibly disabled in the solver. Original exercises keep execution. Read/edit-only imports are excluded from graded event/assessment/assignment selectors, daily challenge selection and graded learning-path/certificate targets.

The prior pristine-install, live execution, REA and original-content reports are historical evidence for the 22 November baseline. This follow-up passed the full 106-check local suite, then 50 affected integration/catalogue/quiz checks after the final learning-path adjustment. The publication verifier checked all 250 detail payloads, blocked Run/Submit on both repaired exercises, verified 17 graded event options, 267 public reading entries, actual editor input, and desktop/mobile views. Full catalogue runtime acceptance remains open.

Repeat-safe command: `node node_modules/tsx/dist/cli.mjs scripts/publish-reading-catalogue.mts --apply`. Omit `--apply` for preview. The pre-publication backup is `.local/backups/before-publication-20261125.dump`. This command verifies the exact reviewed digests, preserves the original problem identities and writes publication audit records.
