import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, '..');

const { argon2id } = await import(
  path.join(appRoot, 'packages/application/node_modules/hash-wasm/dist/index.esm.js')
);

const { PrismaClient } = await import(
  path.join(appRoot, 'packages/database/node_modules/@prisma/client/index.js')
);

const prisma = new PrismaClient();

async function hashPassword(password) {
  const salt = randomBytes(16);
  return argon2id({
    password,
    salt,
    iterations: 3,
    memorySize: 65536,
    parallelism: 4,
    hashLength: 32,
    outputType: 'encoded',
  });
}

async function main() {
  await prisma.$connect();
  console.log('Connected to PostgreSQL.');

  const password = process.env.NEW_PASSWORD || 'ParisianShopper2026!';
  const passwordHash = await hashPassword(password);

  const roles = await prisma.role.findMany();
  console.log(
    'Available roles:',
    roles.map((r) => r.code),
  );

  // 1. Create or update Administrator
  let admin = await prisma.user.findFirst({
    where: { displayName: 'Administrator' },
  });

  if (!admin) {
    admin = await prisma.user.create({
      data: {
        displayName: 'Administrator',
        status: 'ACTIVE',
      },
    });
    console.log('Created Administrator user:', admin.id);
  } else {
    console.log('Found Administrator user:', admin.id);
  }

  // Grant ALL roles to Administrator
  for (const role of roles) {
    const existingRole = await prisma.userRole.findFirst({
      where: { userId: admin.id, roleId: role.id },
    });
    if (!existingRole) {
      await prisma.userRole.create({
        data: { userId: admin.id, roleId: role.id },
      });
    }
  }

  // Assign telegram identity: admin
  const adminTg = await prisma.telegramIdentity.findFirst({
    where: { userId: admin.id },
  });
  if (!adminTg) {
    await prisma.telegramIdentity.create({
      data: {
        userId: admin.id,
        telegramUserId: 100000001n,
        telegramUsername: 'admin',
      },
    });
  } else if (!adminTg.telegramUsername) {
    await prisma.telegramIdentity.update({
      where: { id: adminTg.id },
      data: { telegramUsername: 'admin' },
    });
  }

  // Save Password Credential
  await prisma.passwordCredential.upsert({
    where: { userId: admin.id },
    create: {
      userId: admin.id,
      passwordHash,
      failedLogins: 0,
      lockedUntil: null,
    },
    update: {
      passwordHash,
      failedLogins: 0,
      lockedUntil: null,
    },
  });

  // 2. Also configure Brathna user if present
  const brathna = await prisma.user.findFirst({
    where: { displayName: 'Brathna' },
  });
  if (brathna) {
    for (const role of roles) {
      const existingRole = await prisma.userRole.findFirst({
        where: { userId: brathna.id, roleId: role.id },
      });
      if (!existingRole) {
        await prisma.userRole.create({
          data: { userId: brathna.id, roleId: role.id },
        });
      }
    }
    await prisma.passwordCredential.upsert({
      where: { userId: brathna.id },
      create: {
        userId: brathna.id,
        passwordHash,
        failedLogins: 0,
        lockedUntil: null,
      },
      update: {
        passwordHash,
        failedLogins: 0,
        lockedUntil: null,
      },
    });
    console.log('Enrolled credentials for Brathna (username: @brathna17)');
  }

  console.log('\n======================================================');
  console.log('   ACCOUNT READY FOR EMPLOYEE PORTAL SIGN IN           ');
  console.log('======================================================');
  console.log(`Username / Display Name: Administrator (or admin, or @admin)`);
  console.log(`User ID (UUID):          ${admin.id}`);
  console.log(`Password:                ${password}`);
  console.log(`Roles:                   ${roles.map((r) => r.code).join(', ')}`);
  if (brathna) {
    console.log(`Alternative Username:    Brathna (or @brathna17)`);
    console.log(`Alternative User ID:     ${brathna.id}`);
    console.log(`Alternative Password:    ${password}`);
  }
  console.log('======================================================\n');
}

main()
  .catch((err) => {
    console.error('Account creation error:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
