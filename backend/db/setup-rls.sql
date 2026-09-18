-- =============================================================================
-- IT_HANDOVER: Row-Level Security (RLS) — REVIEW BEFORE ENABLING
-- This script enables RLS on the people and allocations tables so that
-- database-level region isolation is enforced even if application RBAC is bypassed.
-- Test thoroughly in staging before applying to production.
-- The application must set the session variable app.user_region on each connection.
-- See backend/db/pool.js — the IT_HANDOVER comment there explains how to set it.
-- =============================================================================

-- Enable RLS
ALTER TABLE people ENABLE ROW LEVEL SECURITY;
ALTER TABLE allocations ENABLE ROW LEVEL SECURITY;

-- Policy: users see only rows matching their region
-- (Workforce Planning role sees all regions — adjust the bypass condition to match your roles)
CREATE POLICY people_region_isolation ON people
  USING (
    region_id = current_setting('app.user_region', true)::int
    OR current_setting('app.user_role', true) IN ('Workforce Planning', 'EVP', 'Finance')
  );

CREATE POLICY allocations_region_isolation ON allocations
  USING (
    person_id IN (
      SELECT id FROM people
      WHERE region_id = current_setting('app.user_region', true)::int
        OR current_setting('app.user_role', true) IN ('Workforce Planning', 'EVP', 'Finance')
    )
  );
