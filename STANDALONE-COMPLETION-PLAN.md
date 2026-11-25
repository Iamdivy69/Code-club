# CodeClub standalone completion plan

## 1. Goal and scope

Finish the standalone CodeClub site in `D:\PROJECTS\CodeClub` and hand the user a stable Docker build to test manually. The user will decide when to start the DSA V2 merge after testing the standalone site. This plan excludes the merge, changes to either real DSA V2 repository, and payment gateways.

Use the existing DSA V2 UI, React and TypeScript frontend, Fastify API, Prisma and PostgreSQL schema, Redis coordination, DSA-compatible JWT sessions, and Judge0 execution. Keep schema changes additive. Work from the existing implementation and reuse the shared Practice components, services, and DTOs.

The planning baseline is approximately **85% complete and 15% remaining**. Track progress using the release gates below. The percentage does not measure the number of verified catalogue problems.

## 2. Verified starting point

| Area | Current evidence |
| --- | --- |
| Standalone demo | The Docker site was verified at `http://127.0.0.1:34120`. The existing `student@practice.test` login and logout passed. Preserve the demo credentials and its existing database. |
| Local tests | The last complete local run passed **76 automated checks** and the standalone browser suite. The 15 opt-in live Judge0 checks were skipped in that run. Pinned integration copies also passed their browser and rollback rehearsal. Use that as historical compatibility evidence. |
| Execution | The solver and compiler already use Judge0. Run and Submit, drivers, sample cases, hidden grading, Redis leases, and six language options have implementation and fixture coverage. The configured open endpoint serves synthetic development exercises. |
| Catalogue | Seventeen original exercises are already in the build. The 250 approved reference problems passed conversion. The inventory lists 1,488 structurally compatible problem-language pairs across the six languages. Release-grade runtime results for those pairs are outstanding. |
| Account and placement | Existing workflows include local sign-in, account verification and recovery, institution recognition, learner affiliation, officer approval, and access revocation. Google sign-in and account linking passed fixture tests. Live Google and account mail are disabled pending configuration. |
| External stats and AI | LeetCode manual entry and disconnect are live. Sync passed against a local fixture and is disabled in the running demo. Solver hints, coaching, mock interviews, weekly reviews, and opportunity import have existing implementation and fixture coverage. Check the final provider status before handoff. |

Start with the [parity report](integration/codeclub-parity.md), [catalogue evidence](integration/catalogue/README.md), [approved content manifest](integration/catalogue/reviewed-code-club.json), and [local operating instructions](README.md). The upstream reference is [SSVP-debug/code-club at the pinned revision](https://github.com/SSVP-debug/code-club/tree/20f5919c4efa5550a937898471dda7d17edecf92). Inspect the source tree, routes, tests, and shipped artifacts. Skip the upstream README.

## 3. Work order and release gates

| Gate | What closes it |
| --- | --- |
| A. Catalogue and execution | The reviewed inventory accounts for all 250 entries. Every released language for every published entry has runtime evidence for the released digest. The standalone import is repeatable and preserves existing data. |
| B. Learning and events | Daily quiz, offline reading, Edition progression, and event and certificate completion pass browser and API checks with the approved content. |
| C. Community, membership, and admin | Every remaining approved action has a role check, a complete user flow, and evidence of the resulting state. |
| D. Providers and standalone build | Enabled providers pass staging checks. Optional disabled providers show a verified disabled state. Fresh Docker install and upgrade both pass. |
| E. Manual-test handoff | The user receives a versioned standalone candidate, test accounts, scenario checklist, provider status, known issues, and a way to reproduce the build. |

Start catalogue fixture preparation immediately. Run offline reading, quiz behavior, and the remaining community and admin work alongside it. The user has said a controlled Judge0 environment is currently unavailable. Keep that specific gate open while completing the work that can be verified locally.

## 4. Gate A · Catalogue and Judge0

1. **Reproduce the preview.** Use the pinned upstream problem folders and the existing approved manifest. Verify all 250 source digests and rerun offline conversion. Record the slug, converted content digest, enabled languages, target UUID if applicable, proposed version, and disposition for each entry. Check the existing evidence before regenerating work already done.
2. **Resolve fixture issues.** Review `two-sum` first. Its first hidden case has an invalid expected result and an input with multiple valid pairs despite a unique-solution statement. Document the correction and review the resulting digest. Record any other content or driver defect found in the matrix. Keep affected entries unpublished until resolved.
3. **Build the solution manifest.** For each enabled pair, record a known correct solution and a compilable, intentionally incorrect solution. Use the existing verifier and production drivers. Include in-place mutations, callbacks, linked structures, graphs, per-language C and C++ cases, order-insensitive comparisons, operation sequences, and weighted results. Keep fixtures and raw hidden data in controlled storage.
4. **Run the controlled Judge0 verification.** Once a controlled endpoint is available, confirm the six runtime IDs, timeout ceilings, queue behavior, and Redis capacity. Run the full approved matrix in batches. An accepted solution must pass all of its cases. The wrong solution must fail legitimately. Capture content and fixture digests, runtime IDs, and verdicts. Re-run affected pairs after every driver or content repair. The public Judge0 endpoint is for original synthetic development cases only. Keep all approved hidden tests off that endpoint.
5. **Rehearse the standalone import.** Run `--compare` on a backed-up staging copy of the standalone database. Review slug collisions, duplicate identities, version pins for active competitions and assessments, renamed exercises, and existing solves. Apply the approved batch as drafts. Re-run the compare and import to confirm idempotency and stable UUIDs. Record potential future DSA mappings as evidence. Apply them during the later merge phase.
6. **Publish verified content.** Check catalogue search, difficulty, topic and language filters, solver links, statements, examples, editorials, and challenge links. Publish only the verified version and language combinations. Check canonical metadata and sitemap entries for genuinely public pages. Exclude drafts, contest-only material, hidden cases, and authenticated workspaces from public projections.

Use the exact verifier arguments in the [catalogue guide](integration/catalogue/README.md). Keep the inventory, review manifest, solution manifest, compare report, and release-grade runtime report tied to the same candidate. Treat partial batches and synthetic runs as development evidence. Full catalogue acceptance requires a controlled Judge0 pass or a release scope change explicitly accepted by the user.

## 5. Gate B · Learning and events

### Daily quiz

- Inspect `src/data/quizQuestions.js`, `src/routes/DailyQuizGate.jsx`, `src/context/DailyQuizProvider.jsx`, and the pinned daily quiz controller. The active reference flow is a dismissible one-question warm-up on the student dashboard. It uses IST day boundaries and records completion per account. The older global guard is outside the active route.
- Expand the existing four-question CodeClub feature. The reference has **120 questions across 15 topics**, eight each in arrays, strings, sorting, searching, time complexity, linked lists, stacks, queues, trees, graphs, dynamic programming, DBMS, operating systems, JavaScript, and Python. Each has four choices and one answer. Reuse approved material or write original equivalents. The existing catalogue approval covers the 250 problem folders. Confirm separate quiz and Edition reuse permission before copying their content.
- Keep `PracticeQuizAttempt` and existing results. Pin the daily question across refresh and deployments. Record a skip separately from an incorrect answer. Verify the same IST day across devices, next-day rotation, answer review, staff behavior, and concurrent submissions from two tabs. Preserve ordinary dashboard access when the quiz service is unavailable.

### Offline reading

- Inspect the pinned `public/sw.js` and the current solver, catalogue, and visibility rules. The reference supports reading previously loaded public problem material while offline. Fresh HTML navigation requires the network.
- Serve a dedicated public reading projection for explicitly published Practice material. The shared catalogue visibility helper also admits some mapped legacy rows, so check the actual publication flag for offline use. Cache only the public payload. Keep user notes, drafts, submissions, hidden cases, sessions, and private contests out of the cache. Use Practice-owned storage and clear any per-user offline state on sign-out.
- Test saving or loading material while online, reading it with the browser offline, recovery after reconnect, removal of a withdrawn item when the browser reconnects, and cache isolation across account switches. Verify Run and Submit behave correctly when the connection drops.

### Editions, events, and certificate tracks

- Audit `src/data/codeClubEdition.js` and `src/data/code-club-edition/index.js`. The reference has five chapters, including two released chapters of four missions each and three upcoming chapters. The eight mission problems sit outside the approved 250. Prepare a separate content review or eight original equivalents. Run their language contracts through Gate A before release.
- Use existing Practice problem IDs and accepted submissions for mission completion. Unlock missions in sequence and unlock the next chapter when its prerequisite chapter is complete. Verify progress after a rename, across logins, and after a problem is withdrawn. Cover available, locked, completed, and upcoming states on desktop and mobile.
- Inventory the actual site-wide event entry points and map each to the existing competition system where possible. Verify before-start, active, and closed behavior, eligible roles, and scoring boundaries. Match all ten certificate tracks and released missions against published, graded exercises. Test duplicate claims, signed-out verification, valid downloads, and late submissions.

## 6. Gate C · Community, membership, and administration

- **Community and opportunities.** Compare remaining contribution types, opportunity categories, report actions, and moderator actions against the pinned routes and shipped views. For each verified gap, reuse the current review queue and audit log. Test submit, pending, approve, reject, publish, report, and removal. Check owner and moderator boundaries, and keep restricted items out of public discovery.
- **Membership and recruiter benefits.** Create a matrix of the remaining reference benefits and their entry points. Reuse admin grants and earned entitlements, with the existing usage counters and server-side checks. Exercise free, active, expired, revoked, and in-flight states, including recruiter approval and candidate consent. Keep payment integration outside scope.
- **Operational settings.** The pinned reference defines maintenance mode, separate recruiter and placement officer registration controls, and a public announcement. Implement these through the existing Practice admin permission and audit services. Start with defaults that preserve current behavior. Verify registration switches apply to new requests, the admin can recover from maintenance, public announcement payloads contain only public fields, and concurrent settings edits are handled.
- **Progress reset.** Obtain the user's reset policy before implementing the operation. The proposed behavior restarts Practice XP, streaks, and personal challenge progress while retaining submission history, issued certificates, and legacy DSA progress. The decision about retaining or reopening recorded assignment completions is still pending. Once agreed, implement a scoped preview, explicit confirmation, a repeat-safe transaction, and an audit receipt. Test concurrent grading, derived rankings and analytics, repeated requests, and the agreed effect on assignments and certificates. Run resets only against disposable accounts during development.

For each gap, record the source route or artifact, current CodeClub mapping, role rules, DTO changes, migration if needed, and test evidence. Use REA on the relevant shipped reference chunks or service worker where runtime behavior is unclear and on the compiled candidate after implementation. Preserve artifact digests and evidence IDs. Use browser and API tests to prove behavior.

## 7. Gate D · Providers and standalone build

| Provider | Verification |
| --- | --- |
| Judge0 | Use the controlled endpoint for the catalogue and six-language release checks. On two API instances, verify the Redis concurrency limit, lease recovery, timeouts, and one progress update per accepted submission. The open endpoint can remain configured on a synthetic development build. |
| AI | Exercise hints, coaching, interview follow-ups, weekly review generation, and opportunity research where enabled. Cover malformed output, timeout, budget or rate limits, retries, and disabled UI. |
| SMTP | Verify signup email, resend, password reset, and opt-in weekly review using staging recipients. Keep scheduled delivery off in the default demo. |
| Google OAuth | With a configured web client, verify the real callback, explicit linking of an existing account, sign-in, and rejection for an account whose access has been revoked. Exercise the disabled UI when credentials are absent. |
| LeetCode sync | Use an authorized provider when one is available. Verify fetched provenance, stale results, fallback, and disconnect. Use the verified manual path when sync is disabled. |

Use [the environment template](.env.example) for names. Store credentials in the backend environment and keep them out of the handoff. Keep the demo settings and data available. Rehearse clean install and upgrade in separate disposable Docker projects or equivalent isolated environments with distinct ports and storage. Back up before the upgrade rehearsal and prove the database can be restored to a disposable instance.

From the standalone repository, the baseline commands are:

```powershell
npm ci
npm run contracts:check
npm run db:generate
npm run build
npm test
```

Set `DATABASE_URL` to the disposable loopback PostgreSQL database before applying `npm run db:migrate`. Set `PRACTICE_TEST_DATABASE_URL` to that same database, named `practice_test`, and `PRACTICE_TEST_REDIS_URL` to isolated Redis for the full integration run. Use the live Judge0 flags from the [verification guide](README.md#verification-and-integration) for the appropriate synthetic checks. Report passed and skipped checks separately.

Validate Compose with `docker compose config --quiet` and verify startup with `docker compose up -d --build --wait` against the intended project. Check `/api/practice/health`, existing demo sign-in, applied migrations, worker defaults, and data preservation. Use `PRACTICE_WEB_PORT` to verify the actual URL. The current demo uses port `34120`.

## 8. Gate E · Manual-test handoff

Deliver a versioned candidate with the exact source revision, migration list, published content and language manifest, provider status, verification results, startup and restore instructions, and any open release differences for the user's decision. Prepare local test accounts for learner, teacher, placement officer, recruiter, and super admin using the project's fixture setup. Share credentials separately from repository documents.

| Role or scenario | What the user should be able to test |
| --- | --- |
| Signed-out visitor | Browse permitted public material, check a public profile or certificate, and reach sign-in. |
| Learner | Sign in, find a problem, run a sample, submit a solution, reopen history, complete or skip the quiz, read saved material offline, advance an Edition mission, and manage notes, profile visibility, and external stats. |
| Teacher and placement officer | Review an affiliation, join an approved institution, manage a cohort, assign a verified problem, and check role changes and access revocation. |
| Recruiter | Apply for access, find an opted-in candidate, send a message or test, and verify the result of consent withdrawal. |
| Super admin | Review content and accounts, manage published material and settings, verify the audit trail, and test the approved reset policy on a disposable learner. |
| Failure and recovery | Check Judge0 failure, disabled optional providers, reconnection, database upgrade, and retention of existing progress. Cover desktop and mobile in both themes. |

The implementation phase ends when the standalone candidate is ready for the user's manual testing. Capture their findings and resolve release-blocking issues before any later merge decision. Preserve the existing DSA integration files for the later phase.

## 9. Prompt for the next chat

> Continue the standalone CodeClub build in `D:\PROJECTS\CodeClub` using `STANDALONE-COMPLETION-PLAN.md`. Read the current source and evidence first. Use the existing DSA V2 UI, stack, schema baseline, and Judge0 execution. Work through the release gates and prepare a standalone Docker candidate for my manual testing. I will decide separately when to merge into DSA V2. Payment gateways are out of scope. Inspect the pinned upstream source tree and relevant shipped artifacts using REA, skipping the upstream README. The 250 approved catalogue problems can be reused. Keep their hidden cases off public Judge0. A controlled Judge0 environment is currently unavailable, so keep that release gate explicit and continue the independent work. Report completed checks and remaining blockers from evidence.


## Implementation checkpoint · 22 November 2026

A standalone `0.2.0-rc.1` manual-test candidate and evidence are available in [the handoff](integration/standalone/HANDOFF.md). Quiz, offline reading, original Editions, structured community moderation, operational settings, scoped reset and membership corrections are implemented and locally verified. The preserved original demo is separate from the candidate.

This plan is **not fully closed**. Catalogue solution fixtures remain incomplete (52 prepared, 1,436 missing pairs), controlled runtime verification has not run, full certificate-track availability depends on that release, and optional real-provider commissioning is pending. These remain explicit release gates; no DSA merge or payment work was performed.


## Publication follow-up · 25 November 2026

At the user's publication request, all 250 approved problems were published for browsing/editing. The running site now has 267 published problems. Imported Run/custom Run/Submit are disabled in the UI and rejected server-side before judge calls. Original exercises remain executable. This does not close the full catalogue runtime gate or authorize sending approved hidden cases to public Judge0. See [publication report](integration/catalogue/publication-report.json).
