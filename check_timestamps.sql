SELECT
    table_name,
    column_name,
    data_type,
    datetime_precision
FROM information_schema.columns
WHERE table_schema = 'public'
  AND data_type = 'timestamp with time zone'
ORDER BY table_name, ordinal_position;
