# Standalone catalogue preparation candidate

Candidate: `20f5919c4efa5550a937898471dda7d17edecf92-standalone-fixture-r1`.
This is a draft catalogue candidate. The published release matrix remains open.

The exact pinned archive was downloaded without reading its README. Its archive SHA-256 is
`39744b334102a0c281be86fd44b9774e5d1670736f3cddd897fe61850762f718`.
All 250 approved folder digests match. Conversion still yields 1,488 language pairs.
The current `D:/PROJECTS/my-leetcode` checkout is a different revision and only 221 of its
250 folder digests match; do not substitute it for the pinned source.

[Preparation evidence](preparation-report.json) records source and content digests for all
250 entries, enabled languages, fixture coverage and both fixture repairs. Original accepted
and deliberately wrong programs exist for 52 pairs across nine representative problems.
The remaining 1,436 pairs need original accepted and wrong implementations. A complete scan
found no solution directories or implementation files outside starters in the approved folders.
Only two editorials contain fences, both text pseudocode or diagrams; there is no implementation
bank to extract automatically.

[Local development evidence](development-fixture-report.json) passed all 52 prepared pairs across
JavaScript, TypeScript, Python, Java, C++ and C using the production drivers and evaluator.
C/C++ ran in a network-disabled, read-only disposable local container with a temporary workspace.
The correct programs passed all cases and the wrong programs produced legitimate Wrong Answers.
These are local runtime checks, not controlled Judge0 release evidence. No approved hidden cases
were sent to any network execution service.

[Original Edition language evidence](edition-language-report.json) separately passed all 46 enabled
pairs for the eight existing original mission exercises. The two string exercises do not release C;
the other six release all six languages. No upstream Edition content was copied. The test uses the
production drivers and evaluator, including the linked-list and tree contracts. This is local
development evidence; runtime IDs and limits still need deployment commissioning.

## Fixture repairs

The pinned Two Sum first hidden case has an invalid expected pair and two possible valid pairs
while the statement guarantees one. The derivative candidate replaces that case with an original,
unambiguous input and expected pair. Preparation independently enumerates every stored Two Sum
pair and requires exactly one solution with the recorded expected indices.

The final pinned Min Stack hidden case also has an incorrect final `top()` expectation. An
independent operation replay found one erroneous hidden case. The derivative candidate corrects
that expectation, retains the existing replacement starters and binds an explicit reviewed design
contract to the new digest. Four local languages then pass all cases. The pinned archive and
original approval manifest are unchanged. Both repaired entries remain drafts pending controlled
Judge0 verification.

## Reproduce preparation

Keep archive, hidden cases, generated programs, database backups and raw runtime files in ignored
`.local/catalogue` storage. The tracked reports contain only metadata, hashes, UUIDs and verdicts.

```powershell
# Obtain the exact source archive in .local/catalogue/pinned, then use its backend/problems.
node node_modules/tsx/dist/cli.mjs scripts/catalogue-prepare.mts --source '.local/catalogue/pinned/code-club-20f5919c4efa5550a937898471dda7d17edecf92/backend/problems'
node node_modules/tsx/dist/cli.mjs scripts/catalogue-development-check.mts
```

Preparation fails unless all original digests match. It copies the source into controlled
`.local/catalogue/candidate/problems`, applies the two explicit repairs, and writes `reviewed.json`
and `solutions.json` there. The solution manifest accounts for every candidate entry and leaves
missing languages explicit. Repeating preparation reproduces the candidate digests.

When a controlled Judge0 endpoint is available, use the exact verifier described in
[the catalogue guide](README.md#verify-a-reviewed-batch), with this candidate's `problems`,
`reviewed.json` and `solutions.json`. The full run must continue to fail until every missing
fixture is supplied and all 1,488 pairs pass accepted and wrong-solution verification. Never
use the public Judge0 endpoint for these cases.

## Database rehearsal

[Import evidence](import-rehearsal-report.json) comes from `practice_catalogue`, a separate
loopback database restored from a backup of the existing standalone demo. The backup is
`.local/catalogue/demo-before-catalogue.dump`. A synthetic prior Accepted submission and Practice
solve were added only to the disposable copy to make retention checks meaningful.

All 250 entries compared as new with zero collisions and imported as drafts. A second comparison
and import returned 250 unchanged identities. UUIDs stayed stable; the original 17 problem
identities and synthetic prior submission and progress record were preserved. No imported entry
was enabled or published. The live demo received no catalogue imports.

To reproduce, restore the backup into a fresh disposable database named `practice_catalogue`
at loopback port 15432, then run:

```powershell
$env:DATABASE_URL='postgresql://practice:local_practice@127.0.0.1:15432/practice_catalogue?schema=public'
node node_modules/tsx/dist/cli.mjs scripts/catalogue-rehearse.mts
```

The script rejects other database names and hosts. It expects a freshly restored demo copy;
it performs two imports itself and verifies read-only comparisons before and after. Database
backup restore was proved by the successful rehearsal; this does not commission external
providers or publish content.

## Reference artifact inspection

REA parsed the pinned public `sw.js`: one JavaScript file, 5,596 bytes, zero parse failures.
Parent evidence: `ev_851dac1caaece154f627ed98e651fa89b95b791d695a053caae9ac93d0fc0023`.
Artifact directory digest: `dd7eefbe55cd8f40869e0f442c9925b7a5be1dd3a49b87bc130e061d113ae37e`.
The complete retained evidence is in `.local/catalogue/rea-reference-evidence.json`.
The reference uses network-only HTML navigation, hashed asset caching, and narrow public-problem
API caching. This is static inspection; it does not prove browser runtime behavior. No prebuilt
reference app chunks were present in the archive's public directory.
