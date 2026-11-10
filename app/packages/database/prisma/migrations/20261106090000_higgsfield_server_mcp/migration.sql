CREATE TABLE "higgsfield_mcp_connections" (
 "id" VARCHAR(40) PRIMARY KEY DEFAULT 'business', "encrypted_state" TEXT,
 "status" VARCHAR(30) NOT NULL DEFAULT 'DISCONNECTED', "epoch" INTEGER NOT NULL DEFAULT 1,
 "updated_at" TIMESTAMPTZ(3) NOT NULL
);
CREATE TABLE "higgsfield_mcp_audit" (
 "id" UUID PRIMARY KEY, "actor_user_id" UUID NOT NULL, "action" VARCHAR(60) NOT NULL,
 "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE "post_generations" ADD COLUMN "estimated_credits" DECIMAL(19,8),
 ADD COLUMN "actual_credits" DECIMAL(19,8), ADD COLUMN "credit_quote" JSONB;
CREATE FUNCTION preserve_mcp_audit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'MCP connection audit is append-only'; END $$;
CREATE TRIGGER preserve_mcp_audit BEFORE UPDATE OR DELETE ON higgsfield_mcp_audit FOR EACH ROW EXECUTE FUNCTION preserve_mcp_audit();
