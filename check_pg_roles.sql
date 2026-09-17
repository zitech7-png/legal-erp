SELECT
    rolname,
    rolsuper,
    rolcreatedb,
    rolcanlogin
FROM pg_roles
WHERE rolname IN ('postgres', 'app_user', 'user')
ORDER BY rolname;
