# Dependency license policy

This is an engineering compliance control, not legal advice. Exact legal interpretation and exceptional licensing decisions belong to management/legal review.

## Default policy

Dependencies are pinned and reviewed with their transitive graph. Allowed by default are MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC, PostgreSQL License, and equivalently permissive licenses explicitly included in the automated allowlist. Current supporting allowlist entries such as 0BSD, BlueOak-1.0.0, CC0-1.0, Python-2.0, and Unlicense are treated as permissive engineering approvals in this policy baseline.

AGPL, GPL, SSPL, unknown, and unlicensed dependencies fail automatically. LGPL, MPL, source-available, Commons Clause, custom, ambiguous, or any other non-allowlisted expression requires manual review before adoption. A permissive direct dependency does not make all transitive dependencies acceptable.

The server is Valkey (BSD-3-Clause), not a modern Redis release. A Redis image/package substitution requires a new license review. Docker Desktop is outside the application dependency graph and has separate commercial terms.

## Automated check

`pnpm license:check` reads pnpm's installed dependency license report. It fails on prohibited/unknown licenses and on every non-allowlisted license lacking an exact exception. CI runs it after a frozen lockfile installation.

`license-exceptions.json` is the only exceptions registry. An exception must contain exact package name, covered versions, and detected license plus:

- reviewer and review date;
- business/technical reason;
- source license evidence URL or captured notice;
- scope/version constraint;
- obligations and required notices;
- expiry/re-review trigger.

An exception is never added merely to make CI green. AGPL/GPL/SSPL or missing-license adoption also requires an ADR/management decision even if technically isolated. Changes to the check script, allowlist, exceptions, lockfile, package manifests, or container images receive explicit review.

## Release evidence

Release preparation retains the frozen lockfile, dependency report/SBOM, image names/digests, license/notice artifacts required by selected dependencies, scan output, and approved exceptions. Exact tagged license files must be captured when versions are selected; default-branch license links are not sufficient release evidence.
