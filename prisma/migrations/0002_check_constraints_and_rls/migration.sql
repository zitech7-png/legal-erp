-- Migration 0002_check_constraints_and_rls
-- Everything Prisma's schema DSL cannot express natively:
--   (A) CHECK constraints (six, all explicitly specified in ERD Revision 1 / clarification)
--   (B) Partial unique indexes (matter_participant x4, proceeding x1)
--   (C) Row-Level Security — enabled + policy on every [TENANT-SCOPED] table
--   (D) The two cross-parent triggers from ERD §17.1 (role-scope, staff-only assignment)
-- Applied after 0001_init.

-- ============================================================================
-- (A) CHECK CONSTRAINTS — exactly the six explicitly specified in the locked ERD
-- ============================================================================

-- ERD §17.1 Rule 3 — user.user_type
ALTER TABLE "user" ADD CONSTRAINT chk_user_user_type
  CHECK (user_type IN ('staff', 'client'));

-- ERD §9a — matter_participant: exactly one of contact_id / client_id
ALTER TABLE matter_participant ADD CONSTRAINT chk_matter_participant_exactly_one_party
  CHECK (
    (contact_id IS NOT NULL AND client_id IS NULL) OR
    (contact_id IS NULL AND client_id IS NOT NULL)
  );

-- ERD §10 — proceeding: exactly one of platform_case_type_id / tenant_case_type_id
ALTER TABLE proceeding ADD CONSTRAINT chk_proceeding_exactly_one_case_type
  CHECK (
    (platform_case_type_id IS NOT NULL AND tenant_case_type_id IS NULL) OR
    (platform_case_type_id IS NULL AND tenant_case_type_id IS NOT NULL)
  );

-- ERD §12.2 — assignment: exactly one of matter_id / proceeding_id
ALTER TABLE assignment ADD CONSTRAINT chk_assignment_exactly_one_scope
  CHECK (
    (matter_id IS NOT NULL AND proceeding_id IS NULL) OR
    (matter_id IS NULL AND proceeding_id IS NOT NULL)
  );

-- ERD §13.2 — conflict_check: exactly one of the four triggered_by_* columns
ALTER TABLE conflict_check ADD CONSTRAINT chk_conflict_check_exactly_one_trigger
  CHECK (
    (CASE WHEN triggered_by_client_id     IS NOT NULL THEN 1 ELSE 0 END +
     CASE WHEN triggered_by_contact_id    IS NOT NULL THEN 1 ELSE 0 END +
     CASE WHEN triggered_by_matter_id     IS NOT NULL THEN 1 ELSE 0 END +
     CASE WHEN triggered_by_proceeding_id IS NOT NULL THEN 1 ELSE 0 END) = 1
  );

-- ERD §13.3 — conflict_match: exactly one of matched_client_id / matched_contact_id
ALTER TABLE conflict_match ADD CONSTRAINT chk_conflict_match_exactly_one_target
  CHECK (
    (matched_client_id IS NOT NULL AND matched_contact_id IS NULL) OR
    (matched_client_id IS NULL AND matched_contact_id IS NOT NULL)
  );

-- ============================================================================
-- (B) PARTIAL UNIQUE INDEXES
-- ============================================================================

-- ERD §9a — four partial unique indexes on matter_participant (plain NULLs would
-- not prevent duplicate matter-level rows, since Postgres treats NULLs as distinct)
CREATE UNIQUE INDEX uq_matter_participant_matter_level_contact
  ON matter_participant (tenant_id, matter_id, contact_id, role)
  WHERE proceeding_id IS NULL AND contact_id IS NOT NULL;

CREATE UNIQUE INDEX uq_matter_participant_matter_level_client
  ON matter_participant (tenant_id, matter_id, client_id, role)
  WHERE proceeding_id IS NULL AND client_id IS NOT NULL;

CREATE UNIQUE INDEX uq_matter_participant_proceeding_level_contact
  ON matter_participant (tenant_id, matter_id, proceeding_id, contact_id, role)
  WHERE proceeding_id IS NOT NULL AND contact_id IS NOT NULL;

CREATE UNIQUE INDEX uq_matter_participant_proceeding_level_client
  ON matter_participant (tenant_id, matter_id, proceeding_id, client_id, role)
  WHERE proceeding_id IS NOT NULL AND client_id IS NOT NULL;

-- ERD §10 (carried from original ERD, unchanged) — case number unique within a
-- court, not globally; only enforced when a case number has actually been assigned
CREATE UNIQUE INDEX uq_proceeding_court_case_number
  ON proceeding (tenant_id, court_forum_id, case_number)
  WHERE case_number IS NOT NULL;

-- ============================================================================
-- (C) ROW-LEVEL SECURITY
-- ============================================================================
-- Policy shape, identical on every table below, per Blueprint §3.4 / §4:
--   USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
--
-- IMPORTANT — this NULLIF wrapper is not cosmetic; it fixes a real bug caught by
-- running the live concurrency spike (rls-spike-test.js), not a theoretical one:
-- once a custom GUC like app.current_tenant has been touched by SET LOCAL on a
-- given pooled connection, Postgres registers it for that session permanently.
-- After the setting transaction commits/rolls back, current_setting(..., true)
-- on that SAME connection returns an empty string '' — not NULL — for any later
-- request that reuses the connection without itself calling SET LOCAL. Casting
-- ''::uuid directly throws `invalid input syntax for type uuid`, which would
-- crash any request on a reused connection that forgot (or wasn't meant) to set
-- tenant context, instead of the intended default-deny (zero rows) behavior.
-- NULLIF(..., '') converts the empty-string case to a real NULL first, so the
-- subsequent ::uuid cast is NULL::uuid (valid, no error), and
-- `tenant_id = NULL` correctly evaluates to unknown/false — zero rows returned,
-- no exception. Confirmed against a live Postgres 16 instance, not asserted.

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'office', '"user"', 'role', 'role_permission', 'user_role', 'tenant_feature',
    'client', 'contact', 'client_contact',
    'matter', 'matter_participant', 'proceeding', 'proceeding_status_history',
    'tenant_case_type', 'assignment', 'conflict_check', 'conflict_match', 'audit_log'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', t); -- applies RLS even to the table owner
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %s USING (tenant_id = NULLIF(current_setting(''app.current_tenant'', true), '''''''')::uuid) WITH CHECK (tenant_id = NULLIF(current_setting(''app.current_tenant'', true), '''''''')::uuid)',
      t
    );
  END LOOP;
END $$;

-- ============================================================================
-- (D) TRIGGERS — the two genuine cross-parent invariants from ERD §17.1
-- ============================================================================
-- Both are the ONLY triggers in this schema. Every other same-tenant integrity
-- check in this document is enforced declaratively via composite foreign keys
-- (migration 0001_init) — these two are structurally different: they compare
-- two independent parent tables' non-key columns against each other, which
-- Postgres cannot express as a CHECK or composite FOREIGN KEY.

-- Rule 1 (ERD §17.1) — a user_role grant's role.applies_to_user_type must match
-- the user's user_type. A client-portal user can never hold a staff-scoped role.
CREATE OR REPLACE FUNCTION trg_check_user_role_scope() RETURNS trigger AS $$
DECLARE
  v_user_type text;
  v_role_scope text;
BEGIN
  SELECT user_type INTO v_user_type FROM "user" WHERE id = NEW.user_id;
  SELECT applies_to_user_type INTO v_role_scope FROM role WHERE id = NEW.role_id;

  IF v_user_type IS DISTINCT FROM v_role_scope THEN
    RAISE EXCEPTION
      'user_role scope mismatch: user % is type "%" but role % is scoped to "%"',
      NEW.user_id, v_user_type, NEW.role_id, v_role_scope
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_user_role_scope_check
  BEFORE INSERT OR UPDATE ON user_role
  FOR EACH ROW EXECUTE FUNCTION trg_check_user_role_scope();

-- Rule 2 (ERD §17.1) — assignment.user_id must reference a staff-type user.
-- A client-portal user can never appear as an internal Matter/Proceeding assignee.
CREATE OR REPLACE FUNCTION trg_check_assignment_staff_only() RETURNS trigger AS $$
DECLARE
  v_user_type text;
BEGIN
  SELECT user_type INTO v_user_type FROM "user" WHERE id = NEW.user_id;

  IF v_user_type IS DISTINCT FROM 'staff' THEN
    RAISE EXCEPTION
      'assignment.user_id must reference a staff-type user (got user % with type "%")',
      NEW.user_id, v_user_type
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_assignment_staff_only_check
  BEFORE INSERT OR UPDATE ON assignment
  FOR EACH ROW EXECUTE FUNCTION trg_check_assignment_staff_only();

-- ============================================================================
-- Grants for the non-superuser application role (Blueprint §4 requirement)
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO app_user;
