# Code Club feature parity

Reference source at `20f5919c4efa5550a937898471dda7d17edecf92`. [Pinned source tree](https://github.com/SSVP-debug/code-club/tree/20f5919c4efa5550a937898471dda7d17edecf92)

The initial REA analysis covered published solver, contest, recruiter, and TPO chunks. A subsequent analysis inspected 14 additional public JavaScript chunks. They include dashboard, profile, certifications, leaderboard, battles, candidate tests, admin, opportunities, contributions, ambassador, credits, feature requests, and interview mode. REA parsed 177,014 bytes with zero parse failures. The run inspected shipped client code. The source tree is the reference for data and access rules.

| Evidence | ID |
| --- | --- |
| Initial Code Club application evidence | `ev_e2d626556823b737d866efb8450de1bb7992790d949003901d5d5776b72f30dd` |
| Additional Code Club application evidence | `ev_83f362ca8ce0543fb3084fa6e910fd6f1d1a67c23ebf04ec202b10ffe3bac4d3` |
| Additional artifact directory SHA-256 | `e69e99d7488fc9c94b9fd691098f664a5b1639213277f256b835bf4523a17dc5` |
| Standalone compiler, solver, and Judge0 build evidence | `ev_15b4f0dfcd12bc890d0dbcbfae72ef741fe591a793812fbd5a78e7594f54efd9` |
| Standalone artifact directory SHA-256 | `0933ce83e4d49e216fee86a506785a5e75c19ffd37b5f07ea49f237adaa0477b` |
| Live execution candidate backend evidence | `ev_6d6fa80b1b16eec022d23ce22031ed5ef1baacc162cddf60bf5afe51de4004e6` |
| Live execution artifact directory SHA-256 | `aebbb228d56623c593d5223689b3cd173ec34bb3f3140bd88de493a3c67bea40` |
| Advanced Judge0 contract build evidence | `ev_668c8aeccfc00f06f336e2fbee51187cdad3cfe0bc9d40a3c07eba12fde524a5` |
| Advanced contract artifact directory SHA-256 | `98cc1b0eed487828986af68fe352af580d24e099ee6772833c801a72f0d56636` |
| Catalogue import build evidence | `ev_d8ebd5e15ef581b0477fecd34f8d6391b090c0caed6fa9dfaffc2c0468feb658` |
| Catalogue import artifact directory SHA-256 | `96ab23e3a2a056b752d9acb7eae7eebc72868ebdc415da7f5f0b23c0056a80f3` |
| Graph and judge fixture build evidence | `ev_d66e90461e1d54ac87f27f7dad9459a4246101b70759005dfcf88f5ed1a4da88` |
| Graph and judge fixture artifact SHA-256 | `27aec287c741e64ebcab941768f39cc5d5c3fbc1959aed75a40ec82826d615f4` |
| Battle room frontend and API build evidence | `ev_4c56c00baa12e608ab31533054602d54679823045ff6fff2b1f17ae899bee049` |
| Battle room artifact directory SHA-256 | `1c10a12bef863f8b63d57cc8a119e4e43b0e4a8832e7563f8a8b9946be76559a` |

| Area | Implemented behavior | Remaining parity |
| --- | --- | --- |
| Core Judge0 | Separate visible Run and authoritative Submit, six runtime IDs, exact and unordered output, typed scalar and array functions, C row sizes and array outputs, linked lists and binary trees, graph adjacency, unsigned 32-bit results, callback and linked-node fixtures, node references and codec round trips, in-place result capture, typed operation sequences in all six languages, custom tests, standalone compiler, progressive AI solver hints, stored submissions, DSA progress, synchronous and token-based Judge0 transport, shared Redis leases, and statistical verification for weighted index draws. | Remaining signature variants and verification against the selected deployment. |
| Problem bank | Seventeen original exercises, Super Admin draft publication, and an offline catalogue converter with checksum-bound reviews, legacy mappings, and version-aware apply. All 250 reference folders now pass structural conversion. | Full runtime verification of the authorized catalogue, legacy mappings, SEO, and editions remain. |
| Learning and practice | Dashboard, activity, XP, streaks, paths, recommendations by topic, daily and weekly challenges, quiz, bookmarks, notes, playlists, editable profile with consent, and private difficulty ratings on Accepted submissions, learner analytics for acceptance, runtime, coverage, language use, and weekly solves, private AI coaching notes, timed mock interviews, and LeetCode manual entry, provider sync preview, and disconnect. | Exact question bank, offline reading, and live LeetCode provider commissioning if a supported service becomes available. |
| Certificates | Ten fixed solve targets, idempotent claims, QR-linked PDF downloads, public verification, and retained Practice path records. | Full reviewed catalogue availability for every track. |
| Contests and battles | Scheduled public and private contests. Invite-only battle lobbies with team assignments, host start and cancellation, participant departures, locked live rosters, spectators, team and personal solve status, countdown, and final results. Verified submissions award points per player and once per problem per team. Contest-only problems support organizer previews, joined participant access during the event, and signed-in access after the event. | Site-wide event and institution onboarding dependencies are tracked under College and Accounts. |
| Leaderboard | Global pagination, verified college scope, stable XP and solve-count ordering, level and difficulty breakdown, current streak, and opt-in public profiles. | College verification and institution onboarding follow the DSA records for this build. |
| College | Verified DSA class ownership, cohort search and editing, read-only Practice archives, CSV imports with row results, verified student seat activation, assignments, archived completion and per-student follow-up, placement teams with lead designation, transfer, and revocation, and institution readiness with cohort metrics, consent, assignment dates, and PDF export. Includes institution recognition, verified learner affiliation, evidence-based officer review and team grants, and notifications with manual and scheduled assignment reminders. | Target-host rollout follows standalone release acceptance. |
| Recruiter | Admin-reviewed accounts, consent-based candidate discovery, XP ranking and cursor paging, university, topic, language and hiring filters, in-app interest and sent-message history, invitations, candidate inbox notifications, timed tests, public candidate progress verification, QR profile PDFs, and detailed private activity reports with a configurable monthly free allowance. | Remaining membership benefits. |
| Community | Moderated feature requests and voting, contributions, campus ambassador applications and referral milestones, opportunities and apply counts, referral links through standalone and DSA V2 signup, first accepted practice solve qualification, ledger grants, reward stock and redemption, and reviewed opportunity imports from pasted research or structured JSON. | Richer opportunity taxonomy and analytics, contribution variants, and advanced moderation. |
| Admin | Role-checked recruiter approval, catalogue publication, community moderation and reward fulfillment, opportunity management, and a filterable audit log using DSA records, analytics for accounts, submissions, engagement, and the problem catalogue, plus a searchable account directory with audited Practice suspension and restoration. | Operational configuration, Practice progress reset, and remaining account administration workflows. |
| Accounts and providers | DSA-compatible JWT sessions, scoped local signup, standalone Google sign-in and explicit account linking, standalone email verification and password recovery, safe profile visibility, personal plans, administrator membership grants and revocation, earned ambassador access days, and weekly practice email preferences and delivery. | Live Google and SMTP commissioning. |
| DSA merge | Combined installer for both pinned hosts. Rehearsed additive migrations, host sessions, legacy API and solver routes, scoped DSA V2 styling, Practice grading, and rollout rollback against disposable archives. | Approved catalogue import and mapping and release rehearsal against the chosen Judge0 deployment. |

The target UI is DSA V2. The PostgreSQL model extends the DSA base schema and preserves its existing keys. Deterministic contract tests cover comparison behavior and provider failures. The public Judge0 smoke test verifies supported language runtimes. Full deployment and source-wide behavioral parity remain release checks.

## External practice stats

The pinned Code Club reference offers a username-based sync, a manual fallback, and a LeetCode card on the public profile. Its client calls an unofficial proxy through the Code Club backend. The DSA implementation accepts a configured stats provider on the backend and keeps manual entry available during outages. The client reviews fetched results before saving. An account can disconnect and remove the saved data. [Reference stats adapter](https://github.com/SSVP-debug/code-club/blob/20f5919c4efa5550a937898471dda7d17edecf92/backend/routes/leetcode.js) · [Standalone configuration](../README.md#leetcode-solve-history)

An additive table owns the account's external username, solve counts, provenance, and date. A signed preview is scoped to its DSA user and current stats revision. Disconnect erases the username and counts and advances that revision, so a pending preview cannot restore disconnected data. Public profiles use the existing publication control. Recruiter results require an approved recruiter and the learner's discovery consent. External counts are displayed separately from locally judged solves.

REA parsed the public dashboard and profile chunks without failures. Reference evidence `ev_978eeb38e4ca00634596939f842963e31d367b67d511db88422bb606b0f3b4eb` records artifact SHA-256 `d85f47619b420b357e110a00e9e13cb250433ab2b968ae0bff58e4a5f98c44cf`.

All 76 local automated checks passed. The stats fixtures cover provenance, simultaneous preview confirmation, stale counts, provider failure, candidate and profile consent, and disconnect during an outstanding preview. A standalone mobile browser used a loopback provider, saved fetched counts, switched to manual entry during an outage, and verified public disconnection. REA parsed five compiled candidate files without failures. Candidate evidence `ev_aa61c9fabfb872303c9fa0160d5e2b4e1ac1e9b14a4c42f628b9fc4eb1e4a664` records artifact SHA-256 `3d0f717b0063a6ba3d7bc1c45f502f5a40841264442841f4d32473c6107c9a1b`.

The pinned DSA V2 hosts passed the migration and mobile browser rehearsal, including public projection, disconnect, institution approval, and Practice rollback with submission history restored. The combined installer reported zero changes when run a second time. The rebuilt standalone Docker services were healthy and the demo sign-in passed. Live LeetCode sync remains disabled until a provider is configured.

## Standalone Google sign-in

Google sign-in uses the existing CodeClub session and DSA user UUID. Existing users connect Google from **Sign-in methods** after password sign-in. New Google users participate as independent learners. A locally verified email is required for account linking, and new accounts with third-party Google email addresses must complete CodeClub email verification. Live sign-in is disabled until the standalone OAuth web client is configured. [Account identity and provider rules](backend/account-onboarding.md#hosted-google-sign-in)

All 74 local automated checks passed. Added coverage includes OAuth authorization parameters, PKCE and browser binding, invalid and expired state, concurrent callback redemption, preservation of an existing identity, explicit linking, revoked sessions, and CodeClub verification for third-party email addresses. A standalone mobile browser linked a local test account through a separate loopback provider and signed back in through the same DSA user UUID.

REA parsed six compiled frontend and backend JavaScript files without failures. Evidence `ev_a3ae663ceaa766f3984b55e3dc95a06c097681059b6fd51e82e163637fbe4256` records artifact SHA-256 `7b6304ba9c45d1b0859c1d6e88c048a870ac8a6d160bf1d20cf5c24a3d639934`.

## Institution onboarding

Verified users submit a request for the domain on their account. A super admin can approve or reject the request, associate the domain with an existing DSA university or a new record, and revoke the association. Matching standalone learners can join the approved university. Placement authority uses a separate officer request with staff evidence. Admin approval provisions an eligible standalone applicant's DSA teacher profile and team grant. Removing the grant takes effect for existing sessions. [Institution and account mapping](backend/account-onboarding.md#institution-applications-and-access)

The migration applied to both disposable CodeClub databases and to a fresh database for the paired DSA V2 rehearsal. All 70 local automated checks passed, including duplicate request retries, separation of institution and staff approval, cross-university access, and separate domain and staff revocation. Both mobile browsers completed institution approval, learner affiliation, officer approval, and revocation. The pinned installers passed idempotency checks and the enabled, disabled, and restored rehearsal.

REA parsed six compiled backend and embedded frontend files with zero failures. Evidence `ev_ed0d1e9912245e5fd6a2ff8ca0ec13b13eb561375f1560584512fe200cf27dbd` records artifact SHA-256 `bc83fbee10caf9e0c1ea890982a5c27daa863ba132098cb52000d6ef14a11242`.

## Standalone account email

Standalone signup can send a verification link. Learners can request a new verification email or reset a password from the sign-in screen. The backend uses DSA's existing token tables, stores digests, and accepts each token once. Password reset revokes the account's existing standalone sessions. The embedded Practice installer still uses the host's normal account and session flows. [Standalone configuration and rollout](../README.md#standalone-verification-and-password-recovery)

All 69 local automated checks passed. The account tests covered expired and reused verification links, duplicate reset requests, concurrent redemption, rejected accounts, and prior session revocation. The mobile browser verified signup, reloading the verification link, password confirmation, recovery, and sign-in. A loopback SMTP fixture confirmed authentication and delivery over TLS. The disposable DSA V2 installer, browser, and rollback rehearsals passed.

REA parsed five compiled files with zero failures. Evidence `ev_fcf4296c0fc3c683d41949cf5c16e0b117c1ffbf328c4b049545ae2270cd1b21` records artifact SHA-256 `fbb7638e3c7431d16de072c2a8c165921ddc17b6c845593006ba90f52eb2b8bd`.

## Weekly practice review

Students can turn on weekly email from **Your practice → Profile**. Reviews cover the last completed Monday-to-Sunday week in India Standard Time. Verified, active students who opted in and had an Accepted submission on an ordinary Practice problem receive solve totals, acceptance rate, topics, XP, streak, and a short practice suggestion. The coaching provider receives aggregates. The email also links to the student's analytics and email preference. [Reference weekly review job](https://github.com/SSVP-debug/code-club/blob/20f5919c4efa5550a937898471dda7d17edecf92/backend/scripts/sendWeeklyReviewEmails.js)

Existing accounts start with weekly email off. Before handing a review to SMTP, the worker checks the current preference and account state and reserves one dispatch for the week. A failure during AI generation can retry. If SMTP acceptance is uncertain, the worker reports the result for that sweep and leaves the reservation in place to avoid a duplicate.

The command defaults to a dry run that prints the eligible count. Enable delivery with `PRACTICE_WEEKLY_REVIEW_ENABLED=true`, `EMAIL_ENABLED=true`, a configured coaching provider, the DSA `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and `EMAIL_FROM` settings, and a canonical `FRONTEND_URL`. The optional standalone `weekly-review` Compose profile runs hourly checks. The installed DSA backend exposes the same job at `node dist/modules/practice-platform/weekly-review.js`. Pass `--send` to deliver once or `--send --watch` to run hourly.

REA parsed the reference job and email template and the compiled worker and service, with zero parse failures. Reference evidence `ev_1f86babf0fd36adf79cd010d2de5cee1ec08b6893910d51efaa17ea147e0a173` records artifact SHA-256 `fd02123be5b57b2aebe0eab7f7ec1e9db9a4ba014dee960c253bbf6e17918ba3`. Compiled evidence `ev_9ad4198fcf204bde23b396fc206192c24ab5f08d0df9b9d6fb1f8b9d1be78351` records artifact SHA-256 `1a26f4cb453dc6dd6ba51ace4526fe659d4ee007e725cedee41f4041d2247108`.

All 67 local automated checks passed. They covered the date boundary, eligibility, the preference API, dry runs, provider failure and retry, concurrent sweeps, and preference changes during generation. Both browsers exercised opt-in, reload, and opt-out. The installed DSA backend completed a worker dry run and passed the enable, disable, and restore rehearsal.

## Mock interviews

Start a mock interview from an ordinary Practice problem. The session opens with an approach question and provides a Monaco editor, a 45-minute countdown, and a private transcript. The server sets the deadline and allows one active interview per learner. Reloading restores the same exercise and transcript. Finishing or reaching the deadline shows elapsed time and the number of questions asked. [Reference session routes](https://github.com/SSVP-debug/code-club/blob/20f5919c4efa5550a937898471dda7d17edecf92/backend/routes/interview.js)

Each answer requests one follow-up from the configured coaching provider. Up to eight recent exchanges supply context. Editor drafts stay on the device. Selecting **Include current code** shares that draft and its language with the provider for the current answer. When Practice membership limits are enabled, starting an interview requires an active membership. The coaching provider uses the same configuration as solver hints and analytics coaching.

REA parsed the published interview workspace chunk and four compiled implementation files, with zero parse failures. Reference evidence `ev_cea73f7e8a58916331316b56d3737a025608d6bbfea6cf3e5a4dc29c2107bdfd` records artifact SHA-256 `2eb3898bebd76dce2604d129fb0fc6c2e2d744c0add40003fb1819ac81ca0af1`. Implementation evidence `ev_866a38e671d8e2d6f022d38162e83771ecb087627cd5d28e52b859066b4628a6` records artifact SHA-256 `bb094c53489b8907e6b8f933b0ce9704a1d366bb9b996422bf5271816fdfb8fc`.

All 66 local automated checks passed. Interview coverage included ownership, problem eligibility, request retries, concurrent answers, code sharing, provider failures, completion, and server-enforced expiration. Standalone and paired DSA V2 browsers exercised the interview with a local test provider. The paired mobile check verified the transcript, follow-up, and summary. Both pinned installers and the enable, disable, and restore rehearsal passed.


## AI solver hints

The solver offers a nudge, an approach, and a step-by-step walkthrough alongside authored hints. Generation uses the configured coaching provider and sends the accessible problem’s title, topic, difficulty, statement, and constraints. Each request checks solver access before reading the cache. The hint panel appears in ordinary and authorized contest solvers. [Reference hints route](https://github.com/SSVP-debug/code-club/blob/20f5919c4efa5550a937898471dda7d17edecf92/backend/routes/hints.js)

PostgreSQL shares successful hints across users with access to the same problem. The cache is tied to its content version, prompt, model, and depth and expires after 30 days. Concurrent misses reserve one generation. When Practice membership is enabled, free accounts receive three delivered hints per India Standard Time day. Active memberships have unlimited hint access under that policy. The counter changes only when a hint is delivered.

REA parsed the reference route source and four compiled files without parse failures. Reference evidence `ev_59007dea561086f9fa8f464886102be9f19d20f9ee00055e40299b495b9656e5`. Standalone evidence `ev_24ca76de7c5c5483c081e1397902cb595a92bec513525b8fb240d772b8b89033` records artifact SHA-256 `7dfdd3cedc3198e7e0d3f636d9a217cf79bff450a6e0035ac859ee207990c88b`.

All 65 local automated checks passed. They covered all three depths, hidden problem access, the daily allowance, a failed provider response, concurrent cache reuse, and invalidation after a content version change. Standalone and paired DSA V2 browsers generated hints through a loopback provider. The DSA V2 mobile check verified the hint text and remaining allowance. The pinned installer and rollout checks passed.

## AI coaching insights

Learners can request a coaching note from Your Practice → Analytics. The note includes a strongest area, an area to work on, a concrete next step, and encouragement. The provider receives aggregate solve counts by topic and difficulty and a summary of up to 50 recent public Practice submissions. The recent data contains public problem slugs, topics, attempt counts, Accepted flags, and supported language keys. A note stays available to its owner after reload. A successful refresh sets a two-minute cooldown, with PostgreSQL coordinating concurrent requests across replicas. A brief retry window applies after a provider failure. [Reference coaching controller](https://github.com/SSVP-debug/code-club/blob/20f5919c4efa5550a937898471dda7d17edecf92/backend/controllers/insightsController.js)

Configure `PRACTICE_COACHING_AI_URL`, `PRACTICE_COACHING_AI_MODEL`, and `PRACTICE_COACHING_AI_KEY` on the server to enable generation. Use a chat completions endpoint and a model that supports JSON responses. The learner starts the request from the coaching card. The standalone development configuration uses blank settings by default.

REA’s CLI parsed two captured reference chunks and four compiled application files with zero parse failures. Reference evidence `ev_0b35bb24436371b78c1a8d13db4857526f969efe96a42a762ef89d6d899c8f7f`. Standalone evidence `ev_f7f92d3f2a80fb47f431e69a0162ded4fddf26fbb491dd4da4aec9cec6428006` records artifact SHA-256 `32782fe63e5baea625988bc2807e5cdd3b4c7cbfaf79b5c2eed6321f69f9ebe0`.

The automated checks covered owner-only access, public-exercise summaries, the two-minute refresh limit, concurrent requests, and retention of the last good note after a malformed response. Standalone and paired DSA V2 browsers generated a note through a loopback provider on explicit request. The DSA installer and rollback checks passed.

## Learner analytics

The Analytics tab of Your Practice shows the learner’s level, rank, XP progress, solve and streak totals, acceptance rate, mean measured runtime for Accepted submissions, language mix, topic coverage, and recent submissions. The weekly chart uses first solves in eight rolling seven-day buckets ending today in India Standard Time. The accessible table includes each period and its count. Topic coverage compares first solves against the currently available catalogue. Recent history expands from five to at most fifteen submissions and links available exercises to the solver. [Reference analytics calculations](https://github.com/SSVP-debug/code-club/blob/20f5919c4efa5550a937898471dda7d17edecf92/src/hooks/useAnalyticsStats.js)

The API derives the learner from the authenticated session. PostgreSQL aggregates the graded submissions and reads the activity, recent records, and catalogue from one snapshot. The result contains metrics and verdicts without exposing source code, input cases, or diagnostics.

REA parsed the captured Code Club application chunk and four standalone compiled files with zero parse failures. Reference evidence `ev_40cf8f0d016ccb1cd5be0388101095f3adfab1b13265095f2a0a0660a3af8b75`. Standalone evidence `ev_4f6980bb54a7fec5dea6c0523cddc01f23b2ef13a2e0c482a917c66ed6c8d6ed` records artifact SHA-256 `e8f563d2522e53c93e485a8694840a8b631e8a7ddbb87b2c3e4fc10c42242167`.

All 62 local automated checks passed. The learner fixtures covered India Standard Time week boundaries, null runtime samples, retired and contest-only exercise coverage, scoped history, and response privacy. Standalone and DSA V2 Chrome checks verified a populated weekly chart, eight inspectable rows, and the mobile layout. The pinned installers returned zero changes on their second previews, and the DSA V2 rollout checks passed.

## Campus ambassador program

Learners apply with their college name, domain, and optional motivation. Super admins review the application in the Practice queue. Previously approved community submissions retain their ambassador status. The approved dashboard supplies a referral link and counts referral signups against the 5, 10, and 25 milestones. The 14, 30, and 90 day rewards come from the reference milestone policy. Each milestone has one durable claim per account and credits the learner’s earned days. [Reference ambassador routes](https://github.com/SSVP-debug/code-club/blob/20f5919c4efa5550a937898471dda7d17edecf92/backend/routes/ambassador.js) · [Reference milestones](https://github.com/SSVP-debug/code-club/blob/20f5919c4efa5550a937898471dda7d17edecf92/backend/config/ambassadorMilestones.js)

Earned days can be activated with `PRACTICE_BILLING_ENABLED=true`. The reward starts after the latest unrevoked timed access period, or immediately for a free account. Lifetime members can bank days. Claim and activation are transactional, and membership staff can review or revoke the resulting grant. The admin audit log records claims, activations, and decisions.

REA parsed the shipped Code Club ambassador page and five compiled standalone files without parse failures. Reference evidence `ev_281254684f20d990adbb4cb109b2969d1e3981fef493357bca24562bda80eb6d`. Standalone evidence `ev_47163d1b8f438f90ae613f72468012a95f91b69b205e88144d28ee997507cc73` records artifact SHA-256 `13bfcbffc860cdff0e05dd7a3897b947c79f650f8451c4d3e130d18675ae9667`.

All 61 local automated checks passed. They covered older approved applications, rejection reasons, each referral threshold, concurrent requests, and access scheduling with an existing membership. Standalone and paired DSA V2 browsers verified application, staff approval, referral progress, claiming, and activation at phone width. Both installer previews reported zero changes after the pinned installations, and the DSA rollout checks passed.

## Opportunity research import

Super admins can paste research or JSON, review up to 25 candidate listings, edit fields, and select what to import. JSON accepts the Practice fields and the reference aliases for organization, type, application URL, source URL, and deadline. The existing Practice catalogue groups listings into internships, jobs, hackathons, and programs. The review reports invalid and already imported rows. Valid rows are saved privately, and concurrent requests for the same title, company, and application URL create one imported listing. A staff member confirms the official source before a separate publish action makes it public. Imports, source verification, and publication are recorded as distinct audit events. [Reference import controller](https://github.com/SSVP-debug/code-club/blob/20f5919c4efa5550a937898471dda7d17edecf92/backend/controllers/adminOpportunityImportController.js)

Unstructured research uses the optional server settings `PRACTICE_OPPORTUNITY_AI_URL`, `PRACTICE_OPPORTUNITY_AI_MODEL`, and `PRACTICE_OPPORTUNITY_AI_KEY`. Set the URL to the configured chat completions endpoint and choose a model that supports JSON output. Structured JSON is parsed locally. [OpenRouter chat completions API](https://openrouter.ai/docs/api/api-reference/chat/send-chat-completion-request)

Paste this shape into the import editor and replace the example details with the official listing.

```json
{
  "opportunities": [
    {
      "title": "Student developer internship",
      "company": "Example Lab",
      "category": "Internship",
      "summary": "A summer placement for students interested in developer tooling.",
      "applyUrl": "https://example.org/apply",
      "sourceUrl": "https://example.org/internship",
      "closingDate": "2099-08-14",
      "remote": true
    }
  ]
}
```

REA parsed four compiled files with zero parse failures. Evidence `ev_60a3845cd21d185c42ec88cdc7f3d4c66cfbd101a56fd9f4c13e7afc9414781a` records artifact SHA-256 `734089181cb7a4d31559253e759445d7cc165c6781e6bed95214eb3534b25153`.

The standalone suite passed 60 automated checks, including text extraction through a loopback provider, malformed provider output, concurrent duplicate prevention, and publication gating. Both Chrome rehearsals verified the staff workflow at phone width. The disposable DSA installation applied the additive migration, returned zero changes on a second installer preview, and passed its enabled, disabled, and restored checks.

## Submission difficulty ratings

The Code Club solver offers an optional four-choice difficulty rating after each Accepted submission. The standalone and embedded DSA V2 solvers offer the same choices in Results and show the saved rating when the learner opens the submission history. Each Accepted attempt can receive one rating. The server checks ownership and the stored verdict. Concurrent or retried requests return the first saved rating, and the solver offers a retry if saving fails. Ratings are private learner feedback. [Reference rating controller](https://github.com/SSVP-debug/code-club/blob/20f5919c4efa5550a937898471dda7d17edecf92/backend/controllers/reflectionController.js)

REA parsed the shipped reference solver chunk and four compiled standalone files with zero parse failures. Reference evidence `ev_b0092443f7727df82b325c56bd3a929f1b70826fcfd907ba7949624cd615b097`. Standalone evidence `ev_fa88367997971fa693e89e7d76968406ca23f8cb264338d2ccf83193eb49e32f` records artifact SHA-256 `f2f96fbd6dd87d986d51418c4695f0508cfe4b7392112e1add8ede88b6ed88a6`.

The standalone suite passed 59 local automated checks. Chrome verified that a failed save could be retried and that the saved rating opened with the submission source. The DSA V2 rehearsal verified the add-on migration, a zero-change installer preview, the rating on a 390 px viewport, and history after disabling and restoring Practice.

## Practice account controls

Super admins can find accounts by name, email, role, and Practice restriction. Students and teachers can be suspended and restored in Practice. The restriction takes effect on their next authenticated Practice request, including requests made with a token already issued by DSA V2. Restoring the restriction allows the existing DSA session to use Practice again if the host still authorizes the account. The migration relates each restriction to the existing User UUID. Admin accounts are protected. Each state change records the actor, account, and reason in the DSA audit log. [Reference account administration controller](https://github.com/SSVP-debug/code-club/blob/20f5919c4efa5550a937898471dda7d17edecf92/backend/controllers/adminController.js)

DSA account approval, account-wide lifecycle, and role changes stay in the host. Optional Practice quotas and membership grants are managed by administrators.

REA parsed four compiled client and server files with zero parse failures. Evidence `ev_151bf54eda4b65b833c13efd8914787b869843fea606c4b5785d10a61abaa5f3` records artifact SHA-256 `10184a75e636e9bf365ab98d0f19624a570102ac1eb389837e937cf73b6b88e7`.

The standalone suite passed 58 local automated checks. Chrome verified suspension, restoration, and the audit log at phone width. The pinned DSA backend passed the enabled, disabled, and restored checks. During suspension, the existing student session received HTTP 403 from Practice and HTTP 200 from the native student dashboard. The paired DSA V2 frontend passed the account administration flow at phone width.

## DSA backend rehearsal

The pinned backend archive used revision `88a1d08950526dea58ec3a48113da114c9df0ec6`. A clean npm install and both the baseline and integrated TypeScript builds passed. The installer planned and applied 42 paths. A second preview returned zero changes. A separate archive with a changed package manifest was rejected before writes.

PostgreSQL applied the 16 host migrations to an empty database. The rehearsal created a student, teacher, teacher-owned problem, completed interview, and solved progress record. It applied six Practice migrations to those records, then verified the original student API aliases, teacher problem bank, and interview history before installation, while enabled, while disabled, and after re-enabling.

With Practice enabled, the existing DSA refresh cookie issued a new token usable by the Practice API. Two Run requests to the controlled Judge0 endpoint executed the visible cases, and four Submit requests executed the full suite. The accepted verdict persisted in Practice history and projected into DSA student and roadmap progress. The row survived rollback and appeared again when the mount was restored.

REA parsed six compiled files with zero failures. The build evidence is `ev_7068d820cd5ceb5c076dec272e6dcdd546a88d8c24dff18f267a6015214ee0ae` and the artifact directory SHA-256 is `299c7e121560f1440c1a1f5aa6ea71b90fd62dd1eda89a422c43149bcabe810c`. See the [backend installer and rehearsal instructions](backend/README.md).

## DSA frontend rehearsal

The pinned frontend archive used revision `7797041c66e80f56c105b553f0b7cf3fe61b1a36`. The combined installer applied 20 frontend paths and 42 backend paths. A postflight preview reported zero changes for both. The frontend rejected an altered dependency manifest before writing. The normal DSA V2 package build completed type checking, Vite compilation, and static prerendering.

The paired browser rehearsal used the host’s sign-in and refresh cookie, tested both catalogue aliases and query preservation, opened the Judge0 and legacy solvers by slug, and checked desktop and phone navigation and theme controls. A visible Run and full Submit reached the controlled Judge0 endpoint. Turning the flag off restored the original catalogue and solver. Turning it back on restored access to the accepted submission history. The DSA arrays page rendered its 3D canvas.

REA parsed the four compiled mount, solver, compiler, and legacy solver modules without parse failures. The build evidence is `ev_4b9c7223a8259071ee00ffeded3c99a9dd99fadfa4db15659e0521d1d8cd293e` and the artifact SHA-256 is `27d17c44ed4049ae22d36f70c9fe5b4fed04335bfeb93f2af8ffb457504372e6`. See the [combined install and browser rehearsal instructions](frontend/README.md).

## Referral rehearsal

An embedded browser session opened a referral link from Credits and Rewards and submitted the existing DSA signup form. The account and referral were recorded together, and the form showed the pending approval confirmation. A pending account could not sign in. After the fixture was approved, two accepted practice submissions produced one configured ledger entry for each account. Malformed referral data and signup with Practice disabled both preserved normal registration. The standalone regression verified that an accepted Battle Room submission leaves the referral pending. [Reference qualification rules](https://github.com/SSVP-debug/code-club/blob/20f5919c4efa5550a937898471dda7d17edecf92/backend/services/referralQualification.js)

REA parsed the compiled signup UI, auth service, rollout guard, referral association, and scoring code. Evidence `ev_9d655b9d18ccdee12a73581a74a6a38f1008530134acc4c52bba46bd2499c871` has artifact SHA-256 `a8ed34c872f3f611ad53edcaedcef699f13315030c62c07614841eed4df21818` and six parsed modules with zero failures.

## Contest-only problem verification

The reference withholds contest-only problems from the general catalogue. The organizer can preview them, joined players can open them during the event, and direct links become available after the event. The Practice solver applies this rule to signed-in users and uses the existing competition window to award points. Contest-only solves stay in submission history and competition results. [Reference contest problem access](https://github.com/SSVP-debug/code-club/blob/20f5919c4efa5550a937898471dda7d17edecf92/backend/services/contestProblemAccess.js)

The standalone regression suite passed 41 checks with PostgreSQL and Redis. The browser saved a contest-only problem into an organizer's contest, opened its preview, and checked the restricted study controls and access from a second account. The archived DSA backend applied all seven additive migrations, verified that its legacy student and teacher routes withhold the exclusive records, and passed the enabled, disabled, and restored Practice checks. The paired DSA browser rehearsal verified authentication, the judge flow, legacy routing, referral credits, and rollback.

REA parsed seven compiled files with zero parse failures. Build evidence `ev_3b8609a5d2ed215bcc7bdf7dcc35b69a80b3204bacbd2430be100f8aa4435a2b` records artifact SHA-256 `71d872b7ea50baf7ad0cb277ecd16985cc8c429e3713c97156b77ef7f6968981`.

## Global and college rankings

The reference separates public global results from the signed-in college results and orders students by XP, then solved count. The global list pages through the top 500 profiles. The college list shows up to 100 profiles from the viewer's verified institution. [Reference leaderboard routes](https://github.com/SSVP-debug/code-club/blob/20f5919c4efa5550a937898471dda7d17edecf92/backend/routes/leaderboard.js)

Practice uses the verified email and active University enrollment on the existing DSA Student record to scope college results. Profiles opt in through Practice settings. The boards and Study dashboard share XP weights and the current streak calculation, which counts consecutive solve days through today or yesterday. The public institution counts include active universities with at least two opted-in verified students. PostgreSQL computes the rankings and API responses avoid caching so profile visibility changes take effect immediately.

The standalone suite passed 42 checks with PostgreSQL and Redis. It verified both boards, stable tied-XP order across pages, the rank cap, college enrollment filtering, profile withdrawal, and exclusion of contest-only progress. The standalone browser verified the competition link, profile publication, both boards, and the signed-in student's row on mobile. The pinned DSA backend passed the baseline, enabled, disabled, and restored checks with the new rankings. The paired DSA browser reached both boards at phone width, verified the signed-in student and verified institution, and passed the legacy and rollback checks. The combined installer reported zero changes against both tested archives.

REA analyzed the shipped reference leaderboard chunk as `ev_ff50a540a17644dce31d5cb26e94e630520824608b0ceca72c6cc5636dd62ecf`. The standalone build analysis parsed four files with zero failures. Evidence `ev_4ddcb276c85fbc8039bd41bdb56b1180b46ce9c68a962c339ef57077efae20d2` records artifact SHA-256 `82011cc112492873d05d47efc881124c9245c4c22961a6fc368fc62e57d7adaf`.

## Battle room verification

REA parsed the compiled client entry and four competition modules with zero parse failures. An isolated test used two browser sessions to create a battle, join by code, assign teams, start the match, and submit an accepted solution through a controlled Judge0 adapter. PostgreSQL tests cover the concurrent start and creation guards, spectator access, pinned problem versions, score deduplication, deadlines, and cancellation. Ten controlled transaction pairs also verified that a commit-time serialization conflict retries, saves one room, and returns the expected conflict for the second request.

## Certification verification

All ten track targets use verified ordinary Practice solves in currently eligible subjects. Claiming a track stores its original recipient name and a durable verification ID. The existing Practice path certificates keep their original IDs and names. The official targets use a separate record from a completed Practice path. [Reference certification routes](https://github.com/SSVP-debug/code-club/blob/20f5919c4efa5550a937898471dda7d17edecf92/backend/routes/certification.js)

The signed-in download uses the authoritative certificate record to generate an A4 landscape PDF in the browser. The QR code and clickable link go to the public verification page on the same frontend origin. The reference uses a server-generated PDF. This build uses a DSA V2 layout and the frontend's existing QR library.

All 45 local tests passed with PostgreSQL and Redis. The browser claimed an eligible track, downloaded its PDF, and verified the public record while signed out. It also downloaded an existing path certificate with a Hindi name and title. Both files rendered as single A4 landscape pages, and their rendered QR codes and link annotations resolved to the expected public URL. The paired DSA browser opened all ten tracks and verified rollback.

REA parsed the reference certification chunk as `ev_7b57e36c86a9e53ac232027f612f4830182407ef62fe7df40c6765cc396e879f`. The build analysis parsed the compiled certificate API and PDF module with zero parse failures. Evidence `ev_cb466217efc553accf0a7f960e9d66abe3e8b711bf775f29e07ebe978f25a627` records artifact SHA-256 `4b18604b08764ef6955a4072e06fd8a4b395152beabe349b21d2b080c98cda6a`.

## College cohort lifecycle and CSV verification

The Practice cohort is backed by the DSA Class. Existing DSA teachers manage their own university classes. Editing updates the common class fields. Archiving writes a Practice record and freezes roster, edit, and assignment actions while preserving the class and its history. [Reference cohort lifecycle](https://github.com/SSVP-debug/code-club/blob/20f5919c4efa5550a937898471dda7d17edecf92/backend/services/cohortService.js)

CSV imports use the DSA backend's Papa Parse dependency. The upload supports an email column, UTF-8 BOM, quoted multiline fields, up to 10,000 records and a 2 MB limit. Each result reports its physical starting row. The import accounts for both enrolled students and reserved seats. Pending invitations become enrollments when a verified student opens Class assignments with the matching DSA university ID. [Reference roster import](https://github.com/SSVP-debug/code-club/blob/20f5919c4efa5550a937898471dda7d17edecf92/backend/services/cohortImportService.js)

All 48 local automated checks passed with PostgreSQL and Redis. They covered concurrent imports, cross-university isolation, reservation cancellation and activation, archived access, and preservation of native enrollment. The standalone Chrome check uploaded a CSV, displayed row results, edited the cohort and reopened the archive at a 393-pixel viewport. The pinned DSA V2 integration applied the eight Practice migrations after the 16 host migrations. The paired browser opened the original DSA class in the Practice archive through the existing teacher sign-in and verified that the archived cohort had no roster import action. The combined preview found zero remaining installer changes in both archives.

REA inspected the reference TPO dashboard in evidence `ev_f8fb33adacac810d9fce0fd23c10e5d1db0cffdd904ec6dc984cb78e98c6cf9f`. It parsed three built files for the college UI, placement routes and roster parser with zero failures. The build evidence is `ev_201cec77685913275261bdf32a40e0eec6cc97f2149714c24fc1d56e8daaf18f` and its artifact SHA-256 is `e37c7b72c975034595ff3c7d300eb8516a40e485ac003b881110ed418fffb773`.

## Placement team verification

A super admin designates a school's first placement team lead or replaces an ineligible lead. The lead adds existing verified teachers through their DSA University record, transfers leadership, and removes secondary members. Team members can operate on cohorts across their own university. A teacher's original class access comes from the Class record and survives removal from the placement team. Changes use the native DSA audit log. PostgreSQL enforces a single lead per university. [Reference team service](https://github.com/SSVP-debug/code-club/blob/20f5919c4efa5550a937898471dda7d17edecf92/backend/services/tpoTeamService.js)

The PostgreSQL and Redis run passed all 49 local checks. It exercised concurrent transfers, stale lead requests, cross-university isolation, account preservation, and recovery after the lead becomes unverified. The standalone Chrome run used an admin to designate the lead and a teacher to add a member and transfer leadership at a 393-pixel viewport. The pinned DSA backend applied nine Practice migrations to the pre-existing data and verified team access and transfer with native DSA sign-ins. The browser used that same DSA sign-in to check lead and member controls, and rollback restored the legacy routes. The combined installer reported zero pending changes after installation.

REA inspected the shipped reference dashboard as `ev_f8fb33adacac810d9fce0fd23c10e5d1db0cffdd904ec6dc984cb78e98c6cf9f`. It parsed three built JavaScript files with zero failures as `ev_1e8f0a4c4a460fa5535740a2b4422cefe8d9271aac0d069b464b6f131355b675`. The build artifact SHA-256 is `33bf3a693a7dce6da87dc88ddd07dce92914824bbfa39b21cbfdcdf76183e096`.

## Institution readiness reports

Verified placement team members see their DSA university’s report. A super admin selects an active university. Students opt in separately from their public profile and recruiter settings. The report scope uses the verified DSA Student and University records. Only opt-in students contribute solves, activity, cohort metrics and assignment completion. The report shows an aggregate count for other eligible students. Names appear only in the ranked list for opted-in accounts.

The readiness score uses the reference weights of up to 40 points for average solves, 30 for average hard solves, and 30 for the share with an active streak. The date range selects assignment starts in India Standard Time. Completion requires accepted submissions within each assignment’s own window for every assigned problem. Lifetime problem totals and current streaks use the same DSA V2 Practice source as the leaderboard. The PDF refreshes the same scoped report before export.

All 49 local automated checks passed with PostgreSQL and Redis. Tests covered tenant boundaries, consent withdrawal, empty groups and assignment date boundaries. Standalone Chrome exercised adoption and withdrawal of consent, date selection and PDF export at a phone width. The downloaded PDF was rendered and its university, dates, sections and opted-in test student were verified. The disposable DSA backend applied ten Practice migrations after the 16 host migrations and verified report access in the enabled and restored phases. The paired DSA Chrome run loaded the institution’s report using an existing DSA teacher sign-in and verified its opted-in student and PDF control. The combined installer reported zero remaining changes after installation. [Reference readiness weights](https://github.com/SSVP-debug/code-club/blob/20f5919c4efa5550a937898471dda7d17edecf92/backend/utils/readiness.js) · [Reference institution report](https://github.com/SSVP-debug/code-club/blob/20f5919c4efa5550a937898471dda7d17edecf92/backend/services/institutionReportService.js)

REA parsed four files for the built report UI, PDF, routes and aggregation with zero failures. The evidence is `ev_f369cfb0d2f029ae92ee40fbc4961a3a7eb2295524643a2557b673ac23530ac4` and its artifact SHA-256 is `e9087b1f8bf22e8813bea782f0f23cee99e3372a2d6ba9e7330b24bd04de962c`.

## Placement officer verification

Verified DSA teachers apply under their existing university using an email from its registered domains. Applicants can add up to ten notes, appointment references or evidence descriptions while a request is pending. A super admin can review the evidence, approve the application, or reject it with a reason. Applicants can see the decision and submit a new request after rejection.

Approval rechecks the applicant’s current account and affiliation. The decision, evidence snapshot, team grant and native DSA audit entry commit together. The first approved officer becomes the university’s placement lead when the position is empty. Existing direct invitations and administrator designations remain available. The application uses the DSA Teacher role and verified email as the identity signal. Reviewed applications retain their evidence and decision under the original account. [Reference application flow](https://github.com/SSVP-debug/code-club/blob/20f5919c4efa5550a937898471dda7d17edecf92/backend/routes/tpo.js) · [Reference review record](https://github.com/SSVP-debug/code-club/blob/20f5919c4efa5550a937898471dda7d17edecf92/backend/models/TpoVerificationReview.js)

The 50 local checks passed with PostgreSQL and Redis. They covered version changes from added evidence, submission limits, concurrent first-officer approvals, rejection reasons, resubmission, and preservation of DSA teacher records. The standalone browser used separate applicant and administrator sessions to submit evidence, approve the request, and display the resulting status and team access on a phone viewport. The pinned DSA backend applied eleven Practice migrations after the 16 host migrations. Its enabled and restored checks preserved the approval and evidence. The paired DSA Chrome run signed in with the original DSA account and opened the approved request. The combined installer reported zero remaining changes.

REA parsed the compiled verification UI, request route and review service with zero failures. Evidence `ev_a3f4c69671a16a2169ac43b9f3833ff2fb3be44397a540b239c15903156d8dbc` records artifact SHA-256 `ba966f7d585510a2d17c93d4ac970538be6ffefe3d269328a4b7396abe2777cb`.

## In-app notifications and assignment reminders

Members receive private inbox notices for placement team changes and application decisions. Assignment publication notifies enrolled, active DSA students at the cohort’s university. A teacher can remind students who still need to finish an active assignment. Receiving the assignment and its reminders depends on class membership and eligibility. University report consent is a separate setting.

The worker scans assignments due within 24 hours. The automatic reminder and its completion marker are saved in the same transaction. A class lock prevents overlapping runs from sending the same automatic reminder twice. Each record is marked as handled even when every eligible student has completed the work. Teachers can still send manual reminders.

The inbox supports an unread badge, stable paging, an unread filter, and single or bulk read actions. All reads and updates use the signed-in account.

All 51 local checks passed with PostgreSQL and Redis. Tests covered account isolation, cursor paging, read state, the assignment eligibility rules, and duplicate suppression across overlapping automatic runs. Standalone Chrome verified assignment publication, sending a manual reminder, and reading an officer decision. The pinned DSA backend applied twelve Practice migrations and verified the inbox with native DSA account sessions before and after rollback. The installed worker ran to completion in the disposable backend. The paired browser opened that inbox and marked notices as read. [Reference notifications API](https://github.com/SSVP-debug/code-club/blob/20f5919c4efa5550a937898471dda7d17edecf92/backend/routes/notifications.js) · [Reference reminder job](https://github.com/SSVP-debug/code-club/blob/20f5919c4efa5550a937898471dda7d17edecf92/backend/scripts/sendAssignmentAutoReminders.js)

REA parsed the compiled inbox UI, inbox routes and service, assignment audience, and reminder worker with zero failures. Evidence `ev_09437fcf81a36b61c5f8e2fb47cee219a279ce4ccea4e6faf3bb0fc093e832e4` records artifact SHA-256 `3d1161f5e076141b4901daae3794b1a3edb9e7251a1818e6384e0cfaba427deb`.

## Assignment completion and archive

The college workspace shows active and archived assignments. Staff can inspect every eligible student or focus on students with remaining problems. The follow-up list orders students by problems solved, then by name. Problem links use the current Practice catalogue and fall back to an unavailable label when a problem is retired.

The completion calculation uses accepted submissions from the assignment’s start through its deadline or archive time, whichever is earlier. A cohort archive also closes the scoring window for its assignments. The assignment remains available to authorized staff in history. Student assignments and reminders include work in eligible, open cohorts. Reports use the current eligible class roster and preserve the results from the scoring window. [Reference assignment routes](https://github.com/SSVP-debug/code-club/blob/20f5919c4efa5550a937898471dda7d17edecf92/backend/routes/tpo.js)

All 51 local checks passed. The assignment case covered same-university audience isolation, missing problems, post-archive solves, concurrent archives, student delivery, and reminder eligibility. Standalone Chrome opened the archived assignment and confirmed that the completion panel and cohort forms fit a phone-width viewport. The pinned DSA V2 backend applied thirteen Practice migrations and verified archived completion through the native teacher session.

REA parsed the compiled assignment UI, progress service, assignment notices, readiness aggregation, and placement routes with zero failures. Evidence `ev_067ad38ce935cafb9817ff30eb299249e3cb6d7008f958b14b2ce478a6c1385d` records artifact SHA-256 `ea4b15fe21e741b5c9d00198bf02d621f995fa897b8761a14c9209e0f414a0b0`.

## Recruiter discovery and hiring preferences

Approved recruiters can filter opted-in candidates by handle, verified DSA university, solved topic, language used in an accepted practice submission, solve range, preferred role, graduation year, and availability. Candidates are ordered by verified DSA Practice XP with a stable public-handle tie break. The directory includes difficulty totals, level, current streak, and three top topics. Paging uses the last XP and handle as its cursor. Contest-only solves stay out of directory statistics.

Students set availability, preferred role and expected graduation under Profile. Those fields are shared with approved recruiters through the existing recruiter-search consent. Layout and data are based on the DSA profile system. The directory returns public handles and active verified university names, and each search reads current consent. [Reference candidate search](https://github.com/SSVP-debug/code-club/blob/20f5919c4efa5550a937898471dda7d17edecf92/backend/routes/recruiter.js)

All 52 local checks passed. Candidate cases covered account approval, XP ties, pagination, combined filters, unavailable institution data, and immediate consent withdrawal. Standalone Chrome saved a student’s hiring preferences, filtered the directory with an approved recruiter account, and verified removal after the student withdrew consent. The DSA V2 backend rehearsal applied fourteen Practice migrations and returned the matching XP-ranked profile through a native session. Chrome verified the filters with a native DSA recruiter account. The combined installer reported zero pending changes after installation. The directory, profile endpoint, placement entry point, and recruiter UI were parsed with zero failures in REA evidence `ev_397400bbad546cae86616293e9d8da9b10b2261a5d1753f88022b02fdf561f35`, artifact SHA-256 `32058582611c427204f14a7dd21c1c76ccfa87d3582f194d2d4d2b630c3cd77d`. The reference recruiter dashboard was inspected in `ev_ec899c29b2c539d8a772db9d1a8909a2fc6a494b065002d8e33d81c59431cdd0`.

## Recruiter outreach and notifications

The reference notifies candidates when a recruiter sends an interest note or invites them to a skills test. The interest route applies a seven-day cooldown to each recruiter and candidate pair. [Reference recruiter routes](https://github.com/SSVP-debug/code-club/blob/20f5919c4efa5550a937898471dda7d17edecf92/backend/routes/recruiter.js)

The DSA V2 notification opens Recruiter messages or the exact skills test in Placement. Only the candidate and the author can retrieve the test. Candidate consent is checked when outreach is saved. The interest note or invitation commits in the same transaction as the notification. A repeated identical note during the cooldown returns the existing result. An invitation retried with the same request key and details returns the original test. The interest inbox retains each message and each notification opens the corresponding note.

All 53 local checks passed with PostgreSQL and Redis. The recruiter assessment test verified concurrent retries, a changed-payload conflict, the seven-day follow-up window, link access, and consent withdrawal. The standalone and paired DSA browsers used separate recruiter and candidate sessions to send both types of outreach and open their notifications. The standalone flow also checked consent withdrawal. The DSA backend passed baseline, enabled, disabled, and restored checks, and the combined installer reported zero changes after installation. The standalone Docker services passed health checks with the public Judge0 CE configuration.

REA parsed the frontend entry, placement routes, and notification service with zero parse failures. Evidence `ev_8ba4fc87a1b8741ac64fa795914a23577c9c8927e707272759ae86b9cea7d7e1` records artifact SHA-256 `ff2792dd4cf78952e1726401cb1cebfb8672cf2d1ed9a652dc1c7528a42d8318`.

### Sent-message history

Approved recruiters can see their latest 100 sent messages in Placement. Every new note retains the candidate’s public handle as it was when the note was sent. Existing rows retain their recipient, body, and timestamp. Their original handles were never recorded, so they appear under a generic candidate label. A change in the candidate’s public settings stops new outreach without disclosing the new handle in previous messages.

The upgrade preserved existing message rows in both disposable PostgreSQL databases. All 53 local checks passed, including preservation of separate follow-ups, original-message links, sender and recipient access, and consent changes. The standalone and paired DSA browser checks both showed the sent note in the recruiter’s history and opened the exact note from the candidate’s inbox. The DSA rollback test confirmed that re-enabling Practice restored the note. The installed frontend and backend matched the kit. The standalone Docker migration and health checks passed.

REA parsed the built placement module and frontend entry with zero parse failures. Evidence `ev_031fecd16199cdc3f4a9a20e99f60d14d60f10caccc9512494d56ff4dcb2a5da` records artifact SHA-256 `39757ab2b5018215753f7176bbf4c84092b67b698b9967938c5d91a87d41c0a4`.

## Candidate profile verification

The reference signs a learner’s solve count and verifies it against current progress. Its separate PDF export adds streaks, topic statistics, and recent activity and applies the billing tier’s download limits. [Reference signature](https://github.com/SSVP-debug/code-club/blob/20f5919c4efa5550a937898471dda7d17edecf92/backend/routes/profileSign.js) · [Reference PDF](https://github.com/SSVP-debug/code-club/blob/20f5919c4efa5550a937898471dda7d17edecf92/backend/routes/profilePdf.js)

In DSA V2, published profiles can sign their solve counts by difficulty. The signed record binds the account, public handle, counts, and timestamp. Anyone with the link can compare the signed totals with the current public progress. A change in totals marks the proof as outdated. Renewing the proof replaces its link, and taking a profile private or renaming its handle revokes the link. Recruiter search consent is independent of public profile consent.

The export generates one A4 PDF in the browser with the handle, XP, level, solve totals, and a QR code. The rendered QR code and clickable annotation linked to the same signed-out verification page. All 53 local checks passed with PostgreSQL and Redis, including concurrent signing, changed progress, altered proof data, and consent withdrawal. The standalone phone-width browser check issued and downloaded a proof, verified it while signed out, and confirmed it was no longer available after revocation.

The pinned DSA backend passed baseline, enabled, disabled, and restored checks. The enabled and restored checks resolved the same proof, and the disabled API returned 404 for it. The paired DSA browser issued a proof, downloaded its PDF, and verified the proof while signed out on a mobile viewport. The combined installer reported zero changes after installation. The standalone Docker API and frontend were healthy with the public Judge0 CE development configuration.

REA parsed the built frontend entry, PDF chunk, and server verification module with zero parse failures. Evidence `ev_4cb909584bdeab6c7c69f9384e6ff65aafc62fc4cb282211d3e5a3baafc8ffc9` records artifact SHA-256 `6d907fbd4e78fb00a093d111eda181e0b9826625fb74d00aee557ef8bca67b92`.

### Private practice activity report

The owner can download a detailed report from Study → Profile even with a private profile or before choosing a handle. It lists solved problems, XP, level, current and best streaks, difficulty counts, eight strongest topics, and ten most recent first solves. The owner’s report uses the existing Practice progress dates and weights. It omits account email, submission source, and private testcase data. The public verification PDF remains available from published profiles.

All 54 local checks passed with PostgreSQL and Redis. They covered signed-out access, owner scoping, private profiles, empty reports, chronological solves, and streak and XP calculations. The standalone browser downloaded the PDF from a private account. The rendered single-page report showed Hindi and CJK labels, kept long titles inside the recent-solves column, and included at most ten recent solves. The paired DSA browser downloaded both PDF types, and the activity report contained the DSA learner's name and accepted solve. The pinned installer and rollback checks passed. The standalone Docker API and frontend passed health checks.

REA parsed the built report service, frontend entry, and PDF chunk with zero parse failures. Evidence `ev_d20eeb8cfacf10322d294e57d6ae74eb030ab4bf6be702172a1d3c98e7006fe4` records artifact SHA-256 `3cdbab9164e16b892381544b317910cbf3124c7600daf66a6af7ecbee9ee8077`. The personal plans section below describes the download allowance.

### Personal plans and the activity PDF allowance

With `PRACTICE_BILLING_ENABLED=true`, free accounts can export one activity PDF per UTC calendar month. An existing attempt can retry with the same request key and receive the same report. Active grants allow unlimited exports. Super admins can grant one of the personal plans and revoke grants with a recorded reason. The timed plans expire automatically. The billing flag defaults to off for standalone development and DSA host integration. [Reference PDF allowance](https://github.com/SSVP-debug/code-club/blob/20f5919c4efa5550a937898471dda7d17edecf92/backend/middleware/premiumGate.js) · [Reference plan definitions](https://github.com/SSVP-debug/code-club/blob/20f5919c4efa5550a937898471dda7d17edecf92/backend/config/featureFlags.js)

The personal plans page shows the current plan and remaining report allowance. Administrators manage plan access.

All 55 local checks passed with PostgreSQL and Redis. They covered concurrent requests, retrying the same report, month rollover, expired and revoked grants, and administrator authorization. The standalone browser consumed the free report, verified a staff grant allowed another download, and confirmed the limit after revocation. The paired DSA browser confirmed that the consumed allowance survived the rollout flag being disabled and re-enabled. The combined installer reported zero differences after installation, and standalone Docker health checks passed with the PDF allowance disabled.

REA parsed the frontend entry and compiled membership modules with zero parse failures. Evidence `ev_870d6733e0a78c9c0004a08ec8795a9973bf762e995431af00e8b0239a6c1409` records artifact SHA-256 `5a2e164d3a134f3040609f717d14b57df84ea3f42f3fcb4e49d4fa08aa3bee60`.

### Practice audit log

Super admins can open **Community → Audit log** and filter the event history by problem bank, community, placement, or membership. Each entry shows the recorded actor, action, time, and target. The view includes the existing placement team and officer decisions. New problem drafts and publication changes, community decisions, opportunity publication, reward changes, recruiter reviews, and membership grants and revocations write to the same native DSA audit table as part of their transaction. [Reference admin audit controller](https://github.com/SSVP-debug/code-club/blob/20f5919c4efa5550a937898471dda7d17edecf92/backend/controllers/adminController.js)

The log returns only the Practice actions and summary fields used by this view. Repeating an unchanged publication or retrying the same membership grant creates no duplicate entry. Historical entries reflect the actions that were recorded at the time.

All 56 local checks passed with PostgreSQL and Redis. They covered administrator authorization, pagination for equal timestamps, exclusion of unrelated native events, redaction of extra metadata, and duplicate-free publication and membership audit entries. The standalone Chrome check opened the audit log on mobile and found membership and placement events. The DSA backend exposed the same records through its native session and denied recruiter access. The paired browser opened the audit log with the DSA administrator account. Rollback and installer checks passed. The standalone API and frontend were healthy.

REA parsed the frontend entry and compiled audit and authoring modules with zero parse failures. Evidence `ev_b5c6c6143a0ef4850d0786a26517d93a4439da58654476797e027a5ddb8da8e3` records artifact SHA-256 `94c7f7508fb4ed1350d4725d6139be1cde5f03b22c2a0747b7450fd7c71d2160`.

### Practice analytics

Super admins can open **Community → Analytics** for DSA account and approval totals, Practice submissions and acceptance rate, engagement, and the published problem catalogue. Daily trends cover 30 UTC days. Weekly trends show twelve rolling seven-day buckets ending on the current UTC day. Monthly trends cover twelve UTC calendar months. Each graph has a table with the underlying counts. [Reference analytics](https://github.com/SSVP-debug/code-club/blob/20f5919c4efa5550a937898471dda7d17edecf92/backend/controllers/adminAnalyticsController.js) · [Reference periods](https://github.com/SSVP-debug/code-club/blob/20f5919c4efa5550a937898471dda7d17edecf92/backend/utils/timeBuckets.js)

Engagement counts distinct accounts with a graded submission. Retention is the share of accounts active in the preceding seven-day window that also submitted in the current window. The most and least solved rankings count accepted submissions in the published catalogue. Contest-only problems are excluded from the catalogue rankings, and their submissions contribute to overall activity. PostgreSQL computes aggregates and returns summary counts. Trend and engagement queries bind explicit UTC timestamps so the database session timezone cannot shift reporting boundaries. The API omits submission source and learner identifiers.

All 57 local checks passed with PostgreSQL and Redis. The analytics regression verified access control, leap-month and rolling-week boundaries, future-record exclusion, aggregate accuracy across all three trends, and contest-only ranking exclusion. The standalone browser opened the analytics page and switched to monthly trends. The final DSA browser rehearsal rendered populated weekly registration and submission charts with the database using its local timezone, checked the mobile table headers, and passed rollback. The installer preview found zero differences on both tested hosts. The supporting indexes are present in standalone Docker.

REA parsed the built frontend entry and compiled analytics module with zero parse failures. Evidence `ev_39d57f0f71bc4751b414b745dd386b2310db559b957714722b9d3cd4e10f0247` records artifact SHA-256 `02f560e367144e3ec1e3cf202602acbb78cb79be08bccd6be2d9f79fc051c29e`.

## Judge0 and custom tests

The standalone Compiler opens at `/practice/compiler`. It sends complete programs and optional standard input to `POST /api/practice/compiler/run` through the shared Judge0 adapter. Both the compiler and the problem editor use the DSA session and the same six runtime IDs.

In the solver, choose **Custom test** and enter an input object and the expected JSON value. Run validates the input against the stored problem contract and reports the user-supplied case. Submit grades the stored suite and records progress. A compiled design task declares constructor and method signatures explicitly in the problem contract. C design tasks use the `ClassName_create` and `ClassName_method` conventions.

Redis lease acquisition and renewal use the server clock. Replicas share a capacity limit and cancel their local Judge0 request if they lose the lease. Standalone Compose runs Redis 7 on loopback. The adapter accepts immediate verdicts or polls a submission token at the configured Judge0 origin. The public endpoint disabled synchronous waiting when it was tested. [Judge0 API](https://ce.judge0.com/docs) · [Public configuration](https://ce.judge0.com/config_info)

The reference has 250 problem manifests. Twenty enable operation sequences, with 12 recording all calls and eight recording returned values only. Seven problems use unordered comparison. The other 243 use exact comparison. Only two manifests provide explicit language return types. The converter checks the compiled-language declarations and each generated driver against the stored cases.

REA parsed seven backend modules with zero parse failures, including the compiled app initialization, Judge0 adapter, and Redis execution queue. An earlier capture inspected the lazy Compiler and Solver chunks. Browser checks exercised the request and response flow.

## Advanced problem contracts

Each problem can declare an ordered `nativeSignature.args` list and its `returns` type. Types include integer and string matrices, single-character buffers, doubles, and long integers within JSON's safe integer range. C functions receive the length of each array and per-row widths for matrices. Array results use the return-size arguments. An in-place function declares `returns: "void"` and an `outputArgument` index.

Use `treeReferences` to link integer selectors to a tree argument by index. For example, `{"argument":1,"root":0}` passes the node whose value equals argument 1 from the tree in argument 0. The selected value must occur once. A `treeResult` of `"value"` compares the returned node's value. Set `treeCodec` with `deserialize` and `className` to run an encode/decode round trip and compare the restored tree. A Python function authored as an instance method declares `pythonClass`.

The seeded exercises **Shared Branch**, **Tree Checkpoint**, and **Row Endpoints** expose these contracts in all six languages.

## Catalogue conversion and import

The offline preview scanned 250 folders at the pinned revision. All 250 pass structural conversion, including 238 with all six language contracts. The pinned Min Stack folder uses replacement class starters in six languages. The pinned weighted picker uses distribution checks for variable results and preserves the exact single-index case. Both compatibility rules are bound to their source digests. The structural preview does not execute the cases. Per-language runtime verification is required for publication. The report excludes hidden inputs and outputs.

The user approved reuse of all 250 pinned problem folders and the offline preview matched every approved digest. The standalone and seeded DSA database comparisons found zero slug collisions. The runtime verifier now checks a known accepted and wrong program against the same driver and evaluator as Submit. A JavaScript pilot passed through a loopback fixture. Catalogue-wide Judge0 verification and explicit legacy mappings remain pending. [Release inventory, reviewed manifest, and pilot evidence](catalogue/README.md)

The reference design format records results for operations after construction. The importer converts tuple sequences and parallel operation arrays to the stored contract and preserves the result layout. Existing authored designs keep their established constructor-result behavior.

A reviewed legacy mapping uses the existing problem UUID and slug. Imported statements and starters live alongside the new practice contract. Legacy metadata, ownership and progress stay on the DSA record. Existing solves appear in the practice catalogue and solver. Re-imports are idempotent, and updates check the expected content version before replacing grading cases. An upcoming competition or open assessment can keep that version pinned.

REA parsed seven compiled importer and driver modules with zero parse failures.

## Stateful stack and weighted draw verification

The reference uses one operation sequence to replay constructor and method calls in a single judge submission. The Min Stack replacement starters support the declared class contract and retain only returning results. The weighted picker preserves its deterministic case and checks the distribution for variable cases. [Reference operation sequence detection](https://github.com/SSVP-debug/code-club/blob/20f5919c4efa5550a937898471dda7d17edecf92/backend/utils/operationSequenceShape.js)

A weighted case runs 8,192 draws and checks the returned indices and their frequency against the constructor weights. The per-index tolerance accounts for expected variance and the number of outcomes. Two original exercises expose the new formats in the standalone library. Controlled local compiler runs verified both formats in all six languages. They checked exact results, a correctly weighted picker, and rejection of a constant picker. All 44 local checks passed with PostgreSQL and Redis. A standalone Chrome run showed the weighted expectation, displayed draw counts on Run, and accepted both hidden cases on Submit. Using original test code, the public Judge0 API accepted the weighted driver in all six languages and the Min Stack driver in Java. The paired DSA browser verified both exercise pages, all six language options, and rollback to the original Practice routes. [Judge0 CE API documentation](https://ce.judge0.com/docs)

REA parsed seven compiled client and server files with zero failures. Evidence `ev_0ebc40a62b91a217c7380ec8ac2b1efeacbe98ac950c48247155ee803dfa5bb8` records artifact SHA-256 `a9e4678d35ff572841b633cec7d7c3e462f3efbe7d38332359b1ef7954f8b51f`.

## Node and callback fixtures

The `GraphNode` type builds connected graphs from adjacency lists with one-based labels. Results preserve neighbor order for each vertex. A `ListNode[]` argument builds independent linked-list heads and preserves empty entries. The `uint32` type supports the full unsigned range, including Java's signed storage representation.

A `versionBoundary` fixture supplies a predicate and passes the tested range to the solution. A `linkedCycle` fixture wires the last node to the selected position. A `sharedListTail` fixture builds one shared suffix so node identity matches across both lists. Invalid selectors are rejected before evaluation.

**First Failing Reading**, **First Shared Relay**, and **Reverse Neighbor Order** use these contracts in the standalone catalogue. REA parsed six compiled runner and converter modules with zero parse failures.

## Verified in this build

- All 53 automated checks passed with PostgreSQL, Redis, and live Judge0. Ten focused driver scenarios also returned the expected results in each of the six local languages.
- The catalogue migration applied to both disposable databases after the original DSA chain and the earlier standalone migrations.
- Desktop and mobile browser checks covered login, Monaco drafts, Run, Submit, custom tests, compiler standard input, history, study, competitions, placement, and community.
- Seven new driver scenarios produced the expected results in all six languages. They covered node identity, codec round trips, ragged and empty matrices, in-place character edits, wide integers, and doubles.
- Live Judge0 passed the six runtime smoke tests and the TypeScript tree reference, Java codec, and C matrix tests. A separate Fastify run verified UTF-8 input and output, a custom Run, and an Accepted Submit with both hidden cases passing. The browser checks used a controlled fixture.
- REA inspected six compiled modules for the new driver contracts and found zero parse failures.
- RapidAPI header handling passed a transport test. An authenticated deployment check and the installation rehearsal against both DSA hosts remain open.
