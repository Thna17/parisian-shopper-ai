-- No policy values or business approvals are backfilled.
ALTER TABLE freshness_policy_versions ADD COLUMN marketing_rules JSONB;
