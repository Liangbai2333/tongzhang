SELECT current_database(), current_user, version(), now() AT TIME ZONE 'UTC' AS checked_at_utc;
SELECT format('SELECT %L AS relation, count(*) AS remaining_rows FROM %I.%I;', tablename, schemaname, tablename)
FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename
\gexec
SELECT count(*) AS temporary_triggers FROM pg_trigger WHERE tgname LIKE 'test_cleanup_%';
SELECT count(*) AS temporary_functions FROM pg_proc WHERE proname LIKE 'test_cleanup_%';
SELECT count(*) AS temporary_constraints FROM pg_constraint WHERE conname LIKE 'test_%';
SELECT count(*) AS fixture_connections FROM pg_stat_activity WHERE datname = current_database() AND application_name LIKE 'tongzhang-test-%';
SELECT count(*) AS advisory_locks FROM pg_locks WHERE database = (SELECT oid FROM pg_database WHERE datname = current_database()) AND locktype = 'advisory';
