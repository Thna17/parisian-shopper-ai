#!/usr/bin/env node
/**
 * Parisian Shopper AI — Demo Seed & Identity Enrollment Script
 *
 * Seeds baseline active brand rules and enrolls Telegram identities
 * with MARKETING_APPROVER permissions for demo and pilot readiness.
 *
 * Usage:
 *   node scripts/seed-demo-data.mjs
 *   node scripts/seed-demo-data.mjs --telegram-id 123456789 --name "Boss Name"
 */

import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '..');

const { PrismaClient } = await import(
  path.join(appRoot, 'packages/database/node_modules/@prisma/client/index.js')
);
const { DEVELOPMENT_BRAND_RULES } = await import(
  path.join(appRoot, 'packages/application/dist/index.js')
);

const args = process.argv.slice(2);
function getArg(flag) {
  const index = args.indexOf(flag);
  return index !== -1 && index + 1 < args.length ? args[index + 1] : undefined;
}

const telegramIdInput = getArg('--telegram-id') ?? getArg('-t');
const nameInput = getArg('--name') ?? getArg('-n') ?? 'Demo Presenter';
const usernameInput = getArg('--username') ?? getArg('-u');

const prisma = new PrismaClient();

async function main() {
  console.log('======================================================');
  console.log('   PARISIAN SHOPPER AI — DEMO SEED & IDENTITY TOOL    ');
  console.log('======================================================\n');

  try {
    await prisma.$connect();
    console.log('Connected to PostgreSQL successfully.\n');

    // 1. Seed or verify active BrandRuleVersion
    const activeBrand = await prisma.brandRuleVersion.findFirst({
      where: { status: 'ACTIVE' },
    });

    if (activeBrand) {
      console.log(
        `[Brand Rules] Active version found: "${activeBrand.name}" (v${activeBrand.version})`,
      );
    } else {
      const createdBrand = await prisma.brandRuleVersion.create({
        data: {
          name: 'Parisian Shopper Luxury Pilot Brand Rules',
          version: 1,
          status: 'ACTIVE',
          languageRules: DEVELOPMENT_BRAND_RULES.language,
          toneRules: DEVELOPMENT_BRAND_RULES.tone,
          ctaRules: DEVELOPMENT_BRAND_RULES.cta,
          promotionRules: DEVELOPMENT_BRAND_RULES.promotion,
          perfumeClaimRules: DEVELOPMENT_BRAND_RULES.perfumeClaims,
          platformRules: DEVELOPMENT_BRAND_RULES.platforms,
          visualGuidance: DEVELOPMENT_BRAND_RULES.visualGuidance,
          activatedAt: new Date(),
        },
      });
      console.log(
        `[Brand Rules] Created active version: "${createdBrand.name}" (v${createdBrand.version}) [ID: ${createdBrand.id}]`,
      );
    }

    // 2. Locate MARKETING_APPROVER role
    const approverRole = await prisma.role.findUnique({
      where: { code: 'MARKETING_APPROVER' },
    });
    if (!approverRole) {
      throw new Error(
        'Role MARKETING_APPROVER not found in database. Did you run prisma:migrate:deploy?',
      );
    }

    // 3. Ensure default test presenter (ID 700000001) exists
    const defaultTelegramId = 700000001n;
    let defaultUser = await prisma.telegramIdentity.findUnique({
      where: { telegramUserId: defaultTelegramId },
      include: { user: { include: { roles: true } } },
    });

    if (!defaultUser) {
      const user = await prisma.user.create({
        data: {
          displayName: 'Standard Demo Presenter',
          status: 'ACTIVE',
        },
      });
      await prisma.userRole.create({
        data: {
          userId: user.id,
          roleId: approverRole.id,
        },
      });
      defaultUser = await prisma.telegramIdentity.create({
        data: {
          userId: user.id,
          telegramUserId: defaultTelegramId,
          telegramUsername: 'parisian_demo_presenter',
        },
        include: { user: { include: { roles: true } } },
      });
      console.log(`[Identity] Enrolled default demo presenter (Telegram ID: ${defaultTelegramId})`);
    } else {
      console.log(`[Identity] Default demo presenter verified (Telegram ID: ${defaultTelegramId})`);
    }

    // 4. Enroll custom Telegram ID if provided
    if (telegramIdInput) {
      const targetId = BigInt(telegramIdInput);
      let customIdentity = await prisma.telegramIdentity.findUnique({
        where: { telegramUserId: targetId },
        include: { user: true },
      });

      if (customIdentity) {
        await prisma.user.update({
          where: { id: customIdentity.userId },
          data: { displayName: nameInput, status: 'ACTIVE' },
        });
        if (usernameInput) {
          await prisma.telegramIdentity.update({
            where: { telegramUserId: targetId },
            data: { telegramUsername: usernameInput },
          });
        }
        const hasRole = await prisma.userRole.findFirst({
          where: { userId: customIdentity.userId, roleId: approverRole.id },
        });
        if (!hasRole) {
          await prisma.userRole.create({
            data: { userId: customIdentity.userId, roleId: approverRole.id },
          });
        }
        console.log(
          `[Identity] Updated enrolled identity: ${nameInput} (Telegram ID: ${targetId}) with MARKETING_APPROVER`,
        );
      } else {
        const user = await prisma.user.create({
          data: {
            displayName: nameInput,
            status: 'ACTIVE',
          },
        });
        await prisma.userRole.create({
          data: {
            userId: user.id,
            roleId: approverRole.id,
          },
        });
        customIdentity = await prisma.telegramIdentity.create({
          data: {
            userId: user.id,
            telegramUserId: targetId,
            telegramUsername:
              usernameInput ?? nameInput.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
          },
          include: { user: true },
        });
        console.log(
          `[Identity] Successfully enrolled new identity: ${nameInput} (Telegram ID: ${targetId}) with MARKETING_APPROVER`,
        );
      }
    }

    console.log('\n======================================================');
    console.log('                 SEEDING COMPLETE                     ');
    console.log('======================================================');
    console.log('System is ready for local demonstration or Telegram bot.');
  } catch (err) {
    console.error('\nSeeding failed:', err);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void main();
