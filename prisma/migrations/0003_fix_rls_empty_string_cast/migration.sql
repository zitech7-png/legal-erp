-- Migration 0003_fix_rls_empty_string_cast
-- Corrects a real bug found by running rls-spike-test.js against a live Postgres
-- instance: the original tenant_isolation policy (0002) cast
-- current_setting('app.current_tenant', true) directly to ::uuid. On a pooled
-- connection where SOME prior transaction had already used SET LOCAL on this
-- custom GUC, Postgres returns '' (empty string) rather than NULL once that
-- transaction ends — and ''::uuid throws `invalid input syntax for type uuid`
-- instead of the intended default-deny behavior. Confirmed by direct
-- reproduction (see conversation record), not assumed.
--
-- Fix: wrap in NULLIF(..., '') to convert the empty-string case to a real NULL
-- before casting, so tenant_id = NULL correctly evaluates to unknown/false —
-- zero rows, no exception — exactly the intended default-deny behavior.

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
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %s', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %s USING (tenant_id = NULLIF(current_setting(''app.current_tenant'', true), '''')::uuid) WITH CHECK (tenant_id = NULLIF(current_setting(''app.current_tenant'', true), '''')::uuid)',
      t
    );
  END LOOP;
END $$;
