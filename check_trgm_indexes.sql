SELECT
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN (
      'idx_client_normalized_name_trgm',
      'idx_contact_normalized_name_trgm'
  )
ORDER BY indexname;
