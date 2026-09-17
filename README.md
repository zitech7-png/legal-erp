# Legal ERP — Month 1 Prisma Schema + PostgreSQL RLS Spike — REVISION 1

**Status:** Revision 1 of the spike, addressing all 9 follow-up points from review.
**Still not final approval** — this is the spike revision, submitted for review per your
instruction to stop and wait.
**No entities, relationships, or ERD architecture changed.** See §9 below — no discrepancies
were found against the locked ERD in this round.

---

## Point-by-point response

### 1. Prisma CLI validation

**`npx prisma format`, `npx prisma validate`, `npx prisma generate` — none can run in this
environment. Confirmed conclusively this round, not just retried and given up on:**

```
$ curl -sI https://binaries.prisma.sh/all_commits/.../schema-engine.gz
HTTP/2 403
x-deny-reason: host_not_allowed
```

This is an explicit egress-proxy allowlist denial (`host_not_allowed`), not a transient network
error — retrying will not change the result. I also confirmed even `npx prisma --version`
fails the same way (it needs to fetch the engine to report its own version), and there is no
bundled offline fallback engine in `node_modules/@prisma` for schema validation (only an
unrelated `pglite.wasm` used by a different Prisma sub-tool). **No Prisma CLI command has run
against `schema.prisma` in this environment, at any point in this project.**

**Exact command to run in an environment with access to `binaries.prisma.sh`:**

```bash
cd legal-erp-prisma-rls-spike
npm install
npx prisma format          # formats + does a basic structural check
npx prisma validate        # full schema validation
npx prisma generate        # generates the TypeScript client — first real compile-level check
                            # that every relation, composite FK, and type resolves correctly
```

If that environment also has network access to a real Postgres instance, the strongest
possible check is:

```bash
npx prisma migrate diff \
  --from-schema-datamodel prisma/schema.prisma \
  --to-url "$DATABASE_URL" \
  --script
```

run against the live database this spike already built — this would produce an empty diff if
`schema.prisma` and the hand-written DDL genuinely match, or show the discrepancy if they
don't. **This specific check has not been run. It is the single most valuable outstanding
verification step, and should be the first thing done once Prisma CLI access exists.**

---

### 2. All six CHECK constraints, tested individually

All six now tested individually, and each in **both** violation modes (all-required-columns-null,
and too-many-columns-set) rather than just one — 11 assertions total (the four-column
`conflict_check` constraint only has one meaningful "too many set" test, not a symmetric pair,
since testing every pairwise combination would be redundant given the same boolean-sum logic).

| Constraint | Both-null rejected | Two-or-more-set rejected |
|---|---|---|
| `user.user_type` | N/A (domain check, not exactly-one-of) | ✅ rejects value outside `(staff, client)` |
| `assignment` | ✅ | ✅ |
| `matter_participant` | ✅ | ✅ |
| `proceeding` | ✅ | ✅ |
| `conflict_check` | ✅ (all four null) | ✅ (two of four set) |
| `conflict_match` | ✅ | ✅ |

All 11 passed on a clean run — see `spike-revision1-output.log`.

---

### 3–4. Expanded RLS isolation across all 18 tenant-scoped tables + explicit proof

**Seeding:** `seedTenantCluster()` in `rls-spike-test-revision1.js` creates one row in **every
single one of the 18 tenant-scoped tables**, per tenant, with real foreign-key relationships
between them (not 18 disconnected rows) — office, user, role, role_permission, user_role,
tenant_feature, client, contact, client_contact, matter, matter_participant, proceeding,
proceeding_status_history, tenant_case_type, assignment, conflict_check, conflict_match,
audit_log. As a bonus (not required, but low-cost and useful), tenant A and tenant B
deliberately exercise **opposite branches** of each exactly-one-of CHECK (e.g. tenant A's
Proceeding uses `tenant_case_type_id`, tenant B's uses `platform_case_type_id`) — meaning the
seed data itself proves both valid branches work, in addition to the CHECK-rejection tests
proving invalid combinations fail.

**Read isolation — all 18 tables, tested by exact row ID, not just aggregate counts:** for
each table, confirmed tenant A can see its own specific row and **cannot** see tenant B's
specific row (18 assertions — 17 by single `id` column, plus `role_permission` by its natural
composite key since it has no single-column PK). All 18 passed.

**Explicit RLS-enabled-everywhere proof (point 4), produced as a real query result, not
asserted:**

```
  Table                        | RLS on | Forced | tenant_isolation policy
  -----------------------------|--------|--------|------------------------
  office                       |   t    |   t    | yes
  user                         |   t    |   t    | yes
  role                         |   t    |   t    | yes
  role_permission              |   t    |   t    | yes
  user_role                    |   t    |   t    | yes
  tenant_feature               |   t    |   t    | yes
  client                       |   t    |   t    | yes
  contact                      |   t    |   t    | yes
  client_contact               |   t    |   t    | yes
  matter                       |   t    |   t    | yes
  matter_participant           |   t    |   t    | yes
  proceeding                   |   t    |   t    | yes
  proceeding_status_history    |   t    |   t    | yes
  tenant_case_type             |   t    |   t    | yes
  assignment                   |   t    |   t    | yes
  conflict_check               |   t    |   t    | yes
  conflict_match               |   t    |   t    | yes
  audit_log                    |   t    |   t    | yes
  jurisdiction                 |   f    |   f    | no (correct — platform-level)
  region                       |   f    |   f    | no (correct)
  forum_type                   |   f    |   f    | no (correct)
  court_forum                  |   f    |   f    | no (correct)
  bench                        |   f    |   f    | no (correct)
  case_type                    |   f    |   f    | no (correct)
  permission                   |   f    |   f    | no (correct)
  tenant                       |   f    |   f    | no (correct)
```

Generated live from `pg_class` + `pg_policies`, not hand-typed — full output in
`spike-revision1-output.log`.

**Cross-tenant INSERT rejection (the "at minimum" ask):** tested on 5 representative tables
spanning two different FK shapes — 3 tables with no composite-FK dependency (`office`,
`client`, `tenant_feature` — where RLS's `WITH CHECK` is the *only* possible mechanism that
could catch a wrong-tenant claim) and 2 tables with a composite-FK dependency (`assignment`,
`proceeding` — where a wrong-tenant claim could theoretically be caught by either the composite
FK or RLS's `WITH CHECK`). All 5 passed. **Empirical finding worth reporting honestly:** I
expected the composite-FK cases might be caught by the FK constraint first; in practice, RLS's
`WITH CHECK` fired first in both cases tested. The test harness reports which specific error
code fired for each case rather than assuming — see the "(rejected via ...)" suffix in the
output log.

**Scope note on point 3's "at minimum" phrasing:** cross-tenant insert rejection was tested on
5 of 18 tables (a representative spread across FK shapes), not all 18 individually — I've
interpreted "at minimum verify... tenant A cannot insert rows claiming tenant B" as requiring
the mechanism be demonstrated soundly, not exhaustively on every table, since all 18 policies
are structurally identical (confirmed in the §4 output above) and the read-isolation test
already exercises all 18. If you want all 18 individually insert-tested as well, that's a
straightforward extension — flagging the interpretation explicitly rather than silently
deciding scope on your behalf.

---

### 5. `NULLIF` fix preserved

Confirmed — `migration.sql` for `0003_fix_rls_empty_string_cast` is byte-for-byte unchanged
from the prior submission, still applied, and every test in this revision (including the new
dedicated pool-reuse test below) passes *because* it's in place. Not reverted, not touched.

---

### 6. Dedicated connection-pool-reuse test

New `testConnectionPoolReuse()` uses a **separate connection pool with `max: 1`** specifically
so there is no ambiguity about whether the same physical connection was reused — with only one
connection permitted, the second "request" is *guaranteed* to reuse the exact connection the
first one used. Sequence tested: request 1 sets `SET LOCAL app.current_tenant` and reads its
own tenant's data; request 2, immediately after, on the same forced-reused connection, sets
**no** tenant context at all. Result: zero rows, no exception. Three assertions, all passed.

---

### 7. What's proven at raw PostgreSQL level vs. what's not yet proven through Prisma

**Proven, live, against a real Postgres 16 instance, as `app_user` (confirmed non-superuser):**
- Every table, composite FK, unique constraint, and index in `schema.prisma` applies cleanly
  as hand-derived SQL DDL (§1's `migrate diff` caveat below is the one thing this doesn't
  cover — see below)
- All 6 CHECK constraints, both violation modes each
- RLS enabled + forced + policy present on exactly the 18 tables that should have it, and
  exactly none of the 8 platform tables
- Read isolation on all 18 tenant-scoped tables
- Cross-tenant insert rejection on a representative 5 tables across 2 FK shapes
- Both `§17.1` triggers (client-can't-hold-staff-role; client-can't-be-assigned)
- Concurrent isolation under real interleaved load (16 requests, 8 per tenant, prior revision)
- The specific connection-pool-reuse failure mode, reproduced, fixed, and now regression-tested

**NOT proven — genuinely open, not glossed over:**
- That `schema.prisma`'s syntax is valid Prisma syntax (needs `prisma validate`)
- That `schema.prisma` actually generates a working TypeScript client with correctly-typed
  relations (needs `prisma generate`) — this is the check most likely to surface a real
  authoring mistake I haven't caught by manual review, since Prisma's relation-resolution
  logic (matching `@relation` names, multi-field FK direction, etc.) has failure modes that
  only show up at generate time, not at the SQL level (my hand-written DDL could be "correct
  SQL" while still not being what `schema.prisma` would actually produce, if I made a
  transcription error going from one to the other)
- That the hand-written DDL is a byte-perfect match for what `prisma migrate dev` would
  generate from `schema.prisma` — I cross-checked by careful manual review (documented in the
  original submission), not by tooling, and `prisma migrate diff` (§1) is the specific command
  that would close this gap
- Any behavior involving Prisma's query engine itself (connection pooling behavior *as
  Prisma manages it*, `$transaction` semantics, Prisma's own handling of `SET LOCAL` via
  `$executeRawUnsafe`) — everything tested this round used raw `pg`, which proves the
  underlying Postgres behavior is correct but not that a Prisma-based application would
  invoke it identically

---

### 8. Minimal RLS integration spike — built, kept isolated, NestJS interceptor NOT built

**Decision, stated explicitly:** I did not build a NestJS interceptor. Reasoning: without a
generated Prisma Client (blocked per §1), any interceptor code calling `prisma.$transaction(...)`
would be unverified illustrative code — I would be asking you to trust untested TypeScript
that imports a module that doesn't exist in this environment. That seemed like exactly the
kind of unproven confidence this whole review process has been pushing back against, so I
didn't do it.

**What I built instead:** `minimal-tenant-context-spike.js` — a single isolated function,
`runInTenantContext(tenantId, handler)`, that implements the *identical* pattern a real
interceptor would (open transaction → `SET LOCAL` → run handler → commit, with guaranteed
rollback on failure), built against raw `pg` so it's actually executable and tested here, not
just described. Five assertions: normal read-your-own-write, no-context-no-crash,
no-context-zero-rows, exception propagation, and — importantly — **rollback on handler
failure** (a failed request doesn't leave a partial insert behind). All 5 passed.

This file is standalone, not imported by or wired into anything else, and does not start any
kind of server or API — consistent with your instruction.

---

### 9. ERD — no changes, no discrepancies found this round

No entity, relationship, cardinality, or constraint from the locked ERD (Revision 1 +
clarification) was altered to make any of this work. Building the full 18-table seed data did
require careful attention to get every FK/CHECK combination right on the *first* correct
attempt per table (e.g. matching `proceeding`'s exactly-one-of case-type branches, or
`matter_participant`'s exactly-one-of party branches) — this was implementation discipline in
the test harness, not a design gap. **No discrepancies between the ERD and the schema were
discovered in this round** — if any had been, this document would report them here rather than
silently adjusting the schema, per your instruction.

---

## Files in this revision

| File | What it is |
|---|---|
| `prisma/schema.prisma` | Unchanged from the original spike submission |
| `prisma/migrations/0001_init/migration.sql` | Unchanged |
| `prisma/migrations/0002_check_constraints_and_rls/migration.sql` | Unchanged (bug included, as originally applied — see prior submission) |
| `prisma/migrations/0003_fix_rls_empty_string_cast/migration.sql` | Unchanged — the fix, preserved per point 5 |
| `rls-spike-test.js` | Original spike test (kept for reference — 7 assertions, `client` table only) |
| `rls-spike-test-revision1.js` | **New** — 39 assertions across all 18 tables, all 6 CHECKs individually, RLS-enabled proof, dedicated pool-reuse test |
| `minimal-tenant-context-spike.js` | **New** — the isolated integration spike (point 8) |
| `spike-revision1-output.log` | Captured full output of the Revision 1 test run: **39 passed, 0 failed** |
| `minimal-integration-spike-output.log` | Captured output of the integration spike: **5 passed, 0 failed** |
| `spike-test-output.log` | Original spike's captured output (kept for reference) |

---

## PASS / FAIL / PENDING Matrix

| Area | Status | Basis |
|---|---|---|
| **Prisma schema** | **PENDING** | Cannot run `prisma validate`/`generate` in this environment (§1). Manually reviewed twice; not tool-verified. Exact commands provided for an environment with engine access. |
| **PostgreSQL DDL** | **PASS** | Applied cleanly to a live Postgres 16 instance with zero errors, across 3 migrations. |
| **RLS** | **PASS** | All 18 tenant-scoped tables confirmed enabled + forced + policy present (live query, §4). All 8 platform tables confirmed correctly excluded. |
| **CHECK constraints** | **PASS** | All 6 tested individually, both violation modes each, 11/11 assertions passed. |
| **Same-tenant composite FKs** | **PASS** | Exercised indirectly via successful seeding of 18-table clusters (every composite FK had to resolve correctly for seeding to succeed at all) and directly via the composite-FK cross-tenant-insert-rejection cases (`assignment`, `proceeding`). Not exhaustively tested per individual composite FK in isolation. |
| **Triggers** | **PASS** | Both `§17.1` rules confirmed live (Rule 2 in the main suite; Rule 1 via a direct follow-up query in the original submission, not re-run this revision but not touched/changed either). |
| **Concurrent isolation** | **PASS** | Carried forward from the original submission (16 interleaved requests, 8 per tenant) — not re-run this revision since nothing relevant changed, but the underlying policies it depends on were re-verified in this revision's §4. |
| **Connection-pool safety** | **PASS** | Original bug reproduced and fixed (prior submission); dedicated `max:1`-pool regression test added this revision, 3/3 passed. |

**Overall: 1 PENDING (Prisma tooling, blocked by environment, not by design), 7 PASS.**
No FAIL. Nothing in this matrix should be read as final sign-off — that determination is
yours to make, this is the evidence for it.

**Stopping here for your review, as instructed.**
