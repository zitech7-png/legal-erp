SELECT
    c.relname AS table_name,
    c.relrowsecurity AS rls_enabled,
    c.relforcerowsecurity AS rls_forced,
    COUNT(p.polname) AS policy_count
FROM pg_class c
JOIN pg_namespace n
    ON n.oid = c.relnamespace
LEFT JOIN pg_policy p
    ON p.polrelid = c.oid
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname IN (
    'assignment',
    'audit_log',
    'client',
    'client_contact',
    'conflict_check',
    'conflict_match',
    'contact',
    'matter',
    'matter_participant',
    'office',
    'proceeding',
    'proceeding_status_history',
    'role',
    'role_permission',
    'tenant_case_type',
    'tenant_feature',
    'user',
    'user_role'
  )
GROUP BY
    c.relname,
    c.relrowsecurity,
    c.relforcerowsecurity
ORDER BY c.relname;
