-- Safe Read-Only SQL execution helper for AI Agent (InfinityInsight)
-- Enforces read-only transactions at the database session level to prevent SQL-injection mutation vectors.

CREATE OR REPLACE FUNCTION execute_readonly_sql(sql_query text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER -- Runs under definer privileges to access tables, but scoped as read-only
AS $$
DECLARE
    result jsonb;
BEGIN
    -- Force current transaction to be read-only
    PERFORM set_config('transaction_read_only', 'on', true);
    
    -- Execute query dynamically and aggregate rows into a single JSONB array
    EXECUTE 'SELECT jsonb_agg(t) FROM (' || sql_query || ') t' INTO result;
    
    RETURN COALESCE(result, '[]'::jsonb);
EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'SQL Sandbox Security Violation or Syntax Error: %', SQLERRM;
END;
$$;

-- Grant execution permission to the authenticated role
GRANT EXECUTE ON FUNCTION execute_readonly_sql(text) TO authenticated;
GRANT EXECUTE ON FUNCTION execute_readonly_sql(text) TO service_role;
