import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import process from 'node:process';

const exceptionsFile = new URL('../security-exceptions.json', import.meta.url);
const workspaceFile = new URL('../pnpm-workspace.yaml', import.meta.url);

const securityPolicy = JSON.parse(readFileSync(exceptionsFile, 'utf8'));
const workspaceContent = readFileSync(workspaceFile, 'utf8');

// Parse auditConfig.ignoreGhsas from pnpm-workspace.yaml
const ignoreGhsasMatch = workspaceContent.match(/ignoreGhsas:\s*\n((?:\s+-\s+[^\n]+\n)+)/);
const workspaceIgnoredGhsas = ignoreGhsasMatch
  ? ignoreGhsasMatch[1]
      .split('\n')
      .map((line) => line.replace(/^\s*-\s*/, '').trim())
      .filter((line) => line.length > 0)
  : [];

const requiredFields = [
  'id',
  'package',
  'affectedVersion',
  'severity',
  'cve',
  'vulnerabilityClass',
  'attackPrerequisites',
  'reason',
  'reviewer',
  'reviewDate',
  'mitigations',
  'residualRisk',
  'upgradeTarget',
  'reReview',
];

const failures = [];
const exceptionsMap = new Map();

for (const exc of securityPolicy.exceptions) {
  exceptionsMap.set(exc.id, exc);
  for (const field of requiredFields) {
    if (typeof exc[field] !== 'string' || exc[field].trim().length === 0) {
      failures.push(`Security exception ${exc.id}: missing or invalid required field "${field}"`);
    }
  }
}

// Ensure every GHSA ignored in workspace has a valid documented exception
for (const ghsa of workspaceIgnoredGhsas) {
  if (!exceptionsMap.has(ghsa)) {
    failures.push(
      `Workspace ignores ${ghsa} but no documented security exception exists in security-exceptions.json`,
    );
  }
}

// Run pnpm audit --prod --json
let rawAudit;
try {
  rawAudit = execFileSync('pnpm', ['audit', '--prod', '--json'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
} catch (error) {
  // pnpm audit exits with code 1 if unignored vulnerabilities exist
  rawAudit = error.stdout?.toString() || error.output?.[1]?.toString() || '{}';
}

let report;
try {
  report = JSON.parse(rawAudit);
} catch (err) {
  failures.push(`Failed to parse pnpm audit output: ${err.message}`);
}

if (report && report.advisories) {
  for (const [id, advisory] of Object.entries(report.advisories)) {
    const ghsaId = advisory.github_advisory_id || id;
    if (!exceptionsMap.has(ghsaId)) {
      failures.push(
        `Unreviewed production vulnerability detected: ${ghsaId} (${advisory.module_name}@${advisory.findings?.[0]?.version ?? 'unknown'} - ${advisory.severity}): ${advisory.title}`,
      );
    }
  }
}

if (failures.length > 0) {
  process.stderr.write(
    `FAIL — Security audit policy violations:\n${failures.map((f) => `  - ${f}`).join('\n')}\n`,
  );
  process.exitCode = 1;
} else {
  const count = workspaceIgnoredGhsas.length;
  const ids = workspaceIgnoredGhsas.join(', ');
  process.stdout.write(
    `PASS — 0 unreviewed findings, ${count} reviewed temporary exceptions (${ids})\n`,
  );
}
