#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(scriptDirectory, '..');
const args = process.argv.slice(2);

function argument(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

const sku = argument('--sku');
const telegramId = argument('--telegram-id');
const requestedFile = argument('--file');

if (!sku || !telegramId) {
  throw new Error(
    'Usage: node scripts/govern-demo-product-asset.mjs --sku SKU --telegram-id ID [--file PATH]',
  );
}

const assetPath = path.resolve(
  appRoot,
  requestedFile ?? path.join('.data', 'assets', 'products', `${sku}.png`),
);

const application = await import(path.join(appRoot, 'packages/application/dist/index.js'));
const database = await import(path.join(appRoot, 'packages/database/dist/index.js'));

const {
  ApproveProductAssetUseCase,
  DiskProductAssetStorageAdapter,
  PermissionService,
  ProductAssetApprovalDecision,
  ProductAssetRightsState,
  ProductAssetRole,
  ProductAssetValidator,
  RegisterProductAssetUseCase,
  VerifyProductAssetRightsUseCase,
} = application;
const { PrismaProductAssetRegistrationUnitOfWork, PrismaProductAssetRepository, PrismaService } =
  database;

const prisma = new PrismaService();

try {
  await prisma.$connect();

  const identity = await prisma.telegramIdentity.findUnique({
    where: { telegramUserId: BigInt(telegramId) },
    include: { user: { include: { roles: { include: { role: true } } } } },
  });
  if (!identity || identity.disabledAt || identity.user.status !== 'ACTIVE') {
    throw new Error(`Active Telegram identity ${telegramId} was not found`);
  }

  const repository = new PrismaProductAssetRepository(prisma);
  const existing = await repository.findApprovedHeroCutoutBySku(sku);
  if (existing) {
    console.log(`Approved governed HERO_CUTOUT already exists for ${sku}: ${existing.id}`);
    process.exitCode = 0;
  } else {
    const buffer = await fs.readFile(assetPath);
    const unitOfWork = new PrismaProductAssetRegistrationUnitOfWork(prisma);
    const storage = new DiskProductAssetStorageAdapter({
      storageRoot: path.join(appRoot, '.data', 'assets'),
    });
    const permissions = new PermissionService();
    const clock = { now: () => new Date() };
    const actor = {
      userId: identity.userId,
      roles: identity.user.roles.map(({ role }) => role.code),
      correlationId: `demo-asset-${sku}`,
    };
    const latestSnapshot = await prisma.productSnapshot.findFirst({
      where: { sku },
      orderBy: { createdAt: 'desc' },
    });

    const register = new RegisterProductAssetUseCase(
      repository,
      storage,
      unitOfWork,
      new ProductAssetValidator(),
      permissions,
      clock,
    );
    const registered = await register.execute({
      actor,
      buffer,
      sku,
      role: ProductAssetRole.HERO_CUTOUT,
      sourceSystem: 'PARISIAN_SHOPPER_DEMO_ASSETS',
      sourceRecordId: path.basename(assetPath),
      originSystem: 'LOCAL_DEVELOPMENT_WORKSPACE',
      productSnapshotId: latestSnapshot?.id,
      rightsNotes: 'Development asset supplied in the project workspace.',
      metadata: { environment: 'development', demoOnly: true },
    });

    const verifyRights = new VerifyProductAssetRightsUseCase(
      repository,
      unitOfWork,
      permissions,
      clock,
    );
    await verifyRights.execute({
      actor,
      registrationId: registered.registration.id,
      rightsState: ProductAssetRightsState.VERIFIED,
      sourceReference: path.relative(appRoot, assetPath),
      permittedScope: 'Local development and internal demonstration only',
      territory: 'INTERNAL',
      reason: 'DEVELOPMENT_DEMO_ASSET',
      notes: 'This verification does not grant production publishing rights.',
    });

    const approve = new ApproveProductAssetUseCase(
      repository,
      storage,
      unitOfWork,
      permissions,
      clock,
    );
    await approve.execute({
      registrationId: registered.registration.id,
      decision: ProductAssetApprovalDecision.APPROVED,
      actor,
      expectedValidationAssessmentId: registered.validationAssessment.id,
      reason: 'DEVELOPMENT_DEMO_APPROVAL',
      notes: 'Approved for local development and internal demonstration only.',
    });

    console.log(`Governed HERO_CUTOUT registered and approved for ${sku}.`);
    console.log(`Registration: ${registered.registration.id}`);
    console.log(`Asset: ${registered.asset.id}`);
  }
} finally {
  await prisma.$disconnect();
}
