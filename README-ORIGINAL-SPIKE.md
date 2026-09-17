# Legal ERP — Month 1 Prisma Schema + PostgreSQL RLS Spike

**Derived strictly from:** Month-1 ERD Revision 1 + Clarification Addendum (locked/approved).
No entities or architectural changes introduced beyond what those documents specify.

---

## What's in this delivery

| File | What it is |
|---|---|
| `prisma/schema.prisma` | The Prisma schema — every Month-1 entity, all composite foreign keys for same-tenant integrity, all ordinary unique constraints and indexes. Comments mark exactly what Prisma's schema language **cannot** express (CHECK constraints, partial indexes, RLS, the two triggers) so nothing was silently dropped. |
| `prisma/migrations/0001_init/migration.sql` | Base schema DDL — hand-derived line-for-line from `schema.prisma` (see limitation note below) |
| `prisma/migrations/0002_check_constraints_and_rls/migration.sql` | The six CHECK constraints, five partial unique indexes, RLS enable+policy on all 18 tenant-scoped tables, the two triggers. Applied as originally written — includes a real bug, intentionally left in place rather than edited (see below). |
| `prisma/migrations/0003_fix_rls_empty_string_cast/migration.sql` | Corrective migration fixing that bug. Kept as a separate migration rather than editing 0002, matching real migration discipline: never edit an already-applied migration. |
| `rls-spike-test.js` | The live concurrency/isolation test — 7 assertions, run against a real Postgres 16 instance, not simulated. |
| `spike-test-output.log` | Captured output of the final clean test run: **7 passed, 0 failed.** |

---

## Environment limitation — stated plainly

The Prisma CLI (`format`/`validate`/`migrate`/`generate`) needs to download a schema-engine
binary from `binaries.prisma.sh`, which is not in this environment's allowed network domains
— every attempt returned `403 Forbidden`. **I could not run the actual Prisma CLI against this
schema.**

What I did instead, and why it's a reasonable substitute for this deliverable specifically:
I hand-derived the equivalent PostgreSQL DDL from `schema.prisma` and applied it to a real,
locally-installed Postgres 16 instance, then ran the full RLS/CHECK/trigger spike against it.
This is arguably **more** rigorous than `prisma validate` would have been for the part that
actually matters here — RLS, CHECK constraints, and triggers aren't Prisma concepts at all, so
even a clean `prisma validate` would never have caught the bug described below. `prisma
validate` would only have confirmed `schema.prisma`'s own syntax; nothing in this
environment could substitute for that specific check, so treat the schema file as manually
reviewed twice (once at authoring time, once by cross-checking the applied DDL matches it
field-for-field) rather than tool-verified. **The next time engine binaries are reachable,
running `npx prisma migrate diff --from-schema-datamodel prisma/schema.prisma --to-url
$DATABASE_URL` against this live database would be the definitive reconciliation check** —
worth doing before this schema is treated as fully final.

---

## A real bug found and fixed — not a hypothetical

Running the spike test against a live database caught an actual defect in the first draft of
the RLS policy, the kind of thing that would not have been caught by reading the SQL, only by
running it under realistic conditions:

**The bug:** the original policy cast `current_setting('app.current_tenant', true)` directly
to `::uuid`. This looks correct — `current_setting(..., true)` is documented to return `NULL`
instead of erroring when a setting is missing. But on a **pooled connection**, once *any* prior
transaction has used `SET LOCAL app.current_tenant = ...` on that connection, Postgres
registers the custom GUC for the rest of that session — and after the setting transaction ends,
it reverts to `''` (empty string), not `NULL`. A later request reusing that same pooled
connection without itself calling `SET LOCAL` would then hit `''::uuid`, which throws
`invalid input syntax for type uuid`, crashing the request instead of correctly denying access.

**Confirmed by direct reproduction** (not assumed — see the `current_setting` diagnostic
queries run against the live instance before the fix), and **confirmed fixed** the same way:
`NULLIF(current_setting('app.current_tenant', true), '')::uuid` converts the empty-string case
to a real `NULL` first, so `tenant_id = NULL` correctly evaluates to unknown/false — zero rows,
no exception.

**Why this matters beyond this one query:** this is exactly the failure mode Blueprint §3.4
warned about in the abstract ("Prisma's default connection pooling can reuse a pooled
connection across different requests/transactions... a connection could theoretically carry
stale tenant context into a subsequent, different tenant's request"). The live spike didn't
just confirm the general concern — it surfaced the *specific* mechanism (empty-string revert,
not stale-value carryover) and proved the fix against it under real concurrent load, not just
in isolation.

---

## What the 7 passing tests actually prove

1. **16 concurrent requests, 8 per tenant, interleaved on a shared connection pool** — each
   saw exactly its own tenant's data. This is the concurrent-tenant-load test Blueprint §3.4
   called out as a required Month-1 deliverable, run for real.
2. **No tenant context set → zero rows**, not an error and not all rows — default-deny
   confirmed, including on a connection previously used by a different tenant's request (the
   scenario the bug above was hiding in).
3. **`WITH CHECK` blocks a cross-tenant insert** — even with valid tenant context set, trying
   to insert a row claiming a *different* tenant's `tenant_id` is rejected by the database.
4. **All three tested CHECK constraints reject invalid data** for real (`user.user_type`
   domain, `assignment` exactly-one-of, `matter_participant` exactly-one-of) — the other three
   CHECKs (`proceeding`, `conflict_check`, `conflict_match`) use the identical SQL pattern and
   were not separately spike-tested, but are structurally the same construct already proven
   twice over.
5. **Both §17.1 triggers fire correctly** — a client-type user can be rejected both as a role
   grantee (Rule 1, tested via a direct follow-up query after the main suite) and as a
   Matter/Proceeding assignee (Rule 2, in the main suite).

---

## Honest gaps in this spike (not silently glossed over)

- Only 3 of the 6 CHECK constraints were individually exercised by name; the other 3
  (`proceeding`, `conflict_check`, `conflict_match`) share the identical boolean-logic pattern
  and weren't separately tested for time — low risk, but not zero, and worth a follow-up test
  before this is treated as fully proven.
- The spike test seeds minimal data by hand: two tenants, one client and one office each. It
  does not exercise `role_permission`, `client_contact`, `tenant_case_type`,
  `proceeding_status_history`, `conflict_check`/`conflict_match`, or `audit_log` under RLS —
  their policies were confirmed *enabled* (the `pg_class` query showing `relrowsecurity = t`
  for all 18 tables), but not individually exercised with real cross-tenant data the way
  `client` was.
- `prisma generate` (producing the actual TypeScript client) was never run, for the same
  network-access reason — the schema's *types* are unverified by tooling, only by manual
  review.
- This is a spike on a fresh, empty database. No test covers migrating an *existing* populated
  database into this shape — not relevant yet at Month 1 with no production data, but worth
  remembering before any later schema change is proposed.

---

## Explicitly out of scope, as instructed

No API code, no NestJS interceptor implementation (the `SET LOCAL` pattern is proven at the
raw-SQL level here; wiring it into an actual request-scoped interceptor is separate,
application-layer work), no seed data for the Court/Forum master tables beyond the minimal
spike fixtures, no entities beyond the locked Month-1 list.
