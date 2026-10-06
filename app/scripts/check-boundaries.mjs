import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const violations = [];

const rules = [
  {
    prefix: 'packages/application/src/modules/ai/domain/',
    forbidden: [
      '@nestjs/',
      '@parisian-shopper/config',
      '@prisma/',
      'bullmq',
      '@valkey/',
      'express',
      'grammy',
      'openai',
      '@higgsfield/client',
    ],
  },
  {
    prefix: 'packages/application/src/modules/content/domain/',
    forbidden: [
      '@nestjs/',
      '@parisian-shopper/config',
      '@prisma/',
      'bullmq',
      '@valkey/',
      'express',
      'grammy',
      'openai',
      '@higgsfield/client',
    ],
  },
  {
    prefix: 'packages/application/src/modules/brand/domain/',
    forbidden: [
      '@nestjs/',
      '@parisian-shopper/config',
      '@prisma/',
      'bullmq',
      '@valkey/',
      'express',
      'grammy',
      'openai',
      '@higgsfield/client',
    ],
  },
  {
    prefix: 'packages/application/src/modules/telegram/domain/',
    forbidden: [
      '@nestjs/',
      '@parisian-shopper/config',
      '@prisma/',
      'bullmq',
      '@valkey/',
      'express',
      'grammy',
      'openai',
      '@higgsfield/client',
    ],
  },
  {
    prefix: 'packages/application/src/modules/products/domain/',
    forbidden: [
      '@nestjs/',
      '@parisian-shopper/config',
      '@prisma/',
      'bullmq',
      '@valkey/',
      'express',
      'grammy',
      'openai',
      '@higgsfield/client',
    ],
  },
  {
    prefix: 'packages/application/src/modules/creative/domain/',
    forbidden: [
      '@nestjs/',
      '@parisian-shopper/config',
      '@prisma/',
      'bullmq',
      '@valkey/',
      'express',
      'grammy',
      'openai',
      '@higgsfield/client',
    ],
  },
  {
    prefix: 'packages/common/src/domain/',
    forbidden: [
      '@nestjs/',
      '@prisma/',
      'bullmq',
      '@valkey/',
      'express',
      'grammy',
      'openai',
      '@higgsfield/client',
      '@parisian-shopper/database',
      '@parisian-shopper/jobs',
      '@parisian-shopper/logger',
    ],
  },
  {
    prefix: 'packages/application/src/',
    forbidden: [
      '@prisma/client',
      'bullmq',
      '@valkey/valkey-glide',
      'express',
      'grammy',
      'openai',
      '@higgsfield/client',
      '@parisian-shopper/database',
      '@parisian-shopper/jobs',
      '@parisian-shopper/logger',
    ],
  },
  {
    prefix: 'apps/api/src/',
    forbidden: ['@prisma/client', 'bullmq', '@valkey/valkey-glide'],
  },
];

for (const file of await sourceFiles(root)) {
  const relative = path.relative(root, file).split(path.sep).join('/');
  const source = await readFile(file, 'utf8');
  const imports = [
    ...source.matchAll(/(?:import|export)\s+(?:[^'";]+?\s+from\s+)?['"]([^'"]+)['"]/g),
  ].map((match) => match[1]);

  const rule = rules.find((candidate) => relative.startsWith(candidate.prefix));
  if (rule !== undefined) {
    for (const imported of imports) {
      if (
        imported !== undefined &&
        rule.forbidden.some((name) => imported === name || imported.startsWith(name))
      ) {
        violations.push(`${relative}: forbidden import "${imported}"`);
      }
    }
  }

  const isCreativeProviderSource = relative.startsWith('packages/creative-providers/src/');
  const isSdkBoundary = /higgsfield-sdk-client(?:\.spec)?\.ts$/.test(relative);
  if (
    isCreativeProviderSource &&
    !isSdkBoundary &&
    imports.some(
      (imported) => imported === '@higgsfield/client' || imported === '@higgsfield/client/v2',
    )
  ) {
    violations.push(`${relative}: Higgsfield SDK imports are restricted to higgsfield-sdk-client`);
  }
}

const workspacePackages = await loadWorkspacePackages(root);
const edges = new Map(
  workspacePackages.map((item) => [
    item.name,
    Object.keys(item.dependencies).filter((dependency) =>
      workspacePackages.some((candidate) => candidate.name === dependency),
    ),
  ]),
);

for (const name of edges.keys()) {
  detectCycle(name, name, [], edges, new Set());
}

if (violations.length > 0) {
  process.stderr.write(`Module boundary violations:\n${violations.join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write('Module boundaries valid.\n');
}

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (['node_modules', 'dist', 'coverage'].includes(entry.name)) continue;
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await sourceFiles(entryPath)));
    else if (entry.name.endsWith('.ts')) files.push(entryPath);
  }
  return files;
}

async function loadWorkspacePackages(directory) {
  const packages = [];
  for (const packageDirectory of ['apps', 'packages']) {
    const parent = path.join(directory, packageDirectory);
    for (const entry of await readdir(parent, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const packageJson = JSON.parse(
        await readFile(path.join(parent, entry.name, 'package.json'), 'utf8'),
      );
      packages.push({ name: packageJson.name, dependencies: packageJson.dependencies ?? {} });
    }
  }
  return packages;
}

function detectCycle(origin, current, trail, edges, visited) {
  if (visited.has(current)) return;
  visited.add(current);
  const nextTrail = [...trail, current];
  for (const dependency of edges.get(current) ?? []) {
    if (dependency === origin) {
      violations.push(`Workspace dependency cycle: ${[...nextTrail, origin].join(' -> ')}`);
      continue;
    }
    detectCycle(origin, dependency, nextTrail, edges, visited);
  }
}
