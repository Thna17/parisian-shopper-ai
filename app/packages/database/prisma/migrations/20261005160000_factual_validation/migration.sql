CREATE TYPE "ValidationSeverity" AS ENUM ('INFO', 'WARNING', 'BLOCKING');
CREATE TYPE "FactualValidationStatus" AS ENUM ('PASSED', 'PASSED_WITH_WARNINGS', 'BLOCKED', 'FAILED');

CREATE TABLE "validation_results" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "content_version_id" UUID NOT NULL,
  "validator_version" VARCHAR(100) NOT NULL,
  "status" "FactualValidationStatus" NOT NULL,
  "finding_count" INTEGER NOT NULL,
  "blocking_count" INTEGER NOT NULL,
  "warning_count" INTEGER NOT NULL,
  "info_count" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "validation_results_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "validation_results_content_version_id_fkey" FOREIGN KEY ("content_version_id") REFERENCES "content_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "validation_results_nonnegative_counts" CHECK ("finding_count" >= 0 AND "blocking_count" >= 0 AND "warning_count" >= 0 AND "info_count" >= 0),
  CONSTRAINT "validation_results_consistent_counts" CHECK ("finding_count" = "blocking_count" + "warning_count" + "info_count")
);
CREATE UNIQUE INDEX "validation_results_version_validator_key" ON "validation_results"("content_version_id", "validator_version");
CREATE INDEX "validation_results_content_version_created_at_idx" ON "validation_results"("content_version_id", "created_at");

CREATE TABLE "validation_findings" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "validation_result_id" UUID NOT NULL,
  "field" VARCHAR(100) NOT NULL,
  "severity" "ValidationSeverity" NOT NULL,
  "code" VARCHAR(100) NOT NULL,
  "message" VARCHAR(1000) NOT NULL,
  "expected_value" JSONB,
  "actual_value" JSONB,
  "source_path" VARCHAR(300),
  "content_path" VARCHAR(300),
  "metadata" JSONB,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "validation_findings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "validation_findings_validation_result_id_fkey" FOREIGN KEY ("validation_result_id") REFERENCES "validation_results"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "validation_findings_result_severity_idx" ON "validation_findings"("validation_result_id", "severity");
CREATE INDEX "validation_findings_code_idx" ON "validation_findings"("code");

CREATE FUNCTION prevent_validation_result_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'validation_results are append-only'; END; $$;
CREATE TRIGGER validation_results_append_only BEFORE UPDATE OR DELETE ON "validation_results"
FOR EACH ROW EXECUTE FUNCTION prevent_validation_result_mutation();

CREATE FUNCTION prevent_validation_finding_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'validation_findings are append-only'; END; $$;
CREATE TRIGGER validation_findings_append_only BEFORE UPDATE OR DELETE ON "validation_findings"
FOR EACH ROW EXECUTE FUNCTION prevent_validation_finding_mutation();
