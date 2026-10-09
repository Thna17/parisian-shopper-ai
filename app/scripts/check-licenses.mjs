import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import process from 'node:process';

const allowed = new Set([
  '0BSD',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'BlueOak-1.0.0',
  'CC0-1.0',
  'ISC',
  'MIT',
  'PostgreSQL',
  'Python-2.0',
  'Unlicense',
]);
const prohibited = /(?:AGPL|(?:^|[^L])GPL|SSPL|UNKNOWN|UNLICENSED)/i;
const policy = JSON.parse(
  readFileSync(new URL('../license-exceptions.json', import.meta.url), 'utf8'),
);
const exceptions = new Map(
  policy.exceptions.map((exception) => [`${exception.package}|${exception.license}`, exception]),
);

const raw = execFileSync('pnpm', ['-r', 'licenses', 'list', '--json'], {
  cwd: process.cwd(),
  encoding: 'utf8',
});
const report = JSON.parse(raw);
const failures = [];

for (const [license, packages] of Object.entries(report)) {
  for (const dependency of packages) {
    const name = `${dependency.name}@${dependency.versions.join(',')}`;
    const exception = exceptions.get(`${dependency.name}|${license}`);
    if (exception !== undefined) {
      const requiredFields = [
        'reviewer',
        'reviewDate',
        'reason',
        'evidence',
        'obligations',
        'reReview',
      ];
      const missing = requiredFields.filter(
        (field) => typeof exception[field] !== 'string' || exception[field].length === 0,
      );
      const versionsCovered = dependency.versions.every((version) =>
        exception.versions.includes(version),
      );
      if (missing.length > 0 || !versionsCovered) {
        failures.push(
          `${name}: license exception is incomplete or does not cover the installed version`,
        );
      }
      continue;
    }

    if (prohibited.test(license)) {
      failures.push(`${name}: prohibited or unknown license ${license}`);
      continue;
    }
    if (!isAllowedExpression(license)) {
      failures.push(`${name}: license ${license} requires a documented exception`);
    }
  }
}

if (failures.length > 0) {
  process.stderr.write(`Dependency license policy failed:\n${failures.join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    `Dependency license policy passed for ${Object.keys(report).length} license groups.\n`,
  );
}

function isAllowedExpression(expression) {
  if (allowed.has(expression)) return true;
  const identifiers = expression.match(/[A-Za-z0-9.-]+/g) ?? [];
  const licenses = identifiers.filter((identifier) => !['AND', 'OR', 'WITH'].includes(identifier));
  return licenses.length > 0 && licenses.every((license) => allowed.has(license));
}
