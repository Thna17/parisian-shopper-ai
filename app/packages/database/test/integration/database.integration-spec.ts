import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { PrismaService } from '../../src/prisma.service.js';
import { PrismaTransactionManager } from '../../src/outbox/prisma-transaction.manager.js';

const execFileAsync = promisify(execFile);
const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

describe('PostgreSQL and migration foundation', () => {
  let container: StartedPostgreSqlContainer | undefined;
  let prisma: PrismaService | undefined;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:17.6-alpine')
      .withDatabase('parisian_test')
      .withUsername('parisian_test')
      .withPassword('fictional_test_password')
      .start();

    process.env.DATABASE_URL = container.getConnectionUri();
    await execFileAsync(
      'pnpm',
      ['--filter', '@parisian-shopper/database', 'prisma:migrate:deploy'],
      { cwd: appRoot, env: { ...process.env, DATABASE_URL: container.getConnectionUri() } },
    );

    prisma = new PrismaService();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await container?.stop();
  });

  it('applies the tracked baseline migration', async () => {
    const rows = await getPrisma().$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `;

    expect(rows.map((row) => row.table_name)).toEqual(
      expect.arrayContaining(['users', 'roles', 'user_roles', 'outbox_events']),
    );
  });

  it('writes outbox events atomically through the transaction abstraction', async () => {
    const transactions = new PrismaTransactionManager(getPrisma());
    const id = await transactions.run(async ({ outbox }) =>
      outbox.append({
        topic: 'foundation.test',
        schemaVersion: 1,
        idempotencyKey: 'foundation-test-1',
        payload: { fictional: true },
        occurredAt: new Date('2026-10-04T00:00:00.000Z'),
        availableAt: new Date('2026-10-04T00:00:00.000Z'),
      }),
    );

    const event = await getPrisma().outboxEvent.findUniqueOrThrow({ where: { id } });
    expect(event.idempotencyKey).toBe('foundation-test-1');
    expect(event.attemptCount).toBe(0);
  });

  it('rolls back outbox writes when the application transaction fails', async () => {
    const transactions = new PrismaTransactionManager(getPrisma());

    await expect(
      transactions.run(async ({ outbox }) => {
        await outbox.append({
          topic: 'foundation.rollback',
          schemaVersion: 1,
          idempotencyKey: 'foundation-test-rollback',
          payload: { fictional: true },
          occurredAt: new Date('2026-10-04T00:00:00.000Z'),
          availableAt: new Date('2026-10-04T00:00:00.000Z'),
        });
        throw new Error('intentional rollback');
      }),
    ).rejects.toThrow('intentional rollback');

    expect(
      await getPrisma().outboxEvent.count({
        where: { idempotencyKey: 'foundation-test-rollback' },
      }),
    ).toBe(0);
  });

  function getPrisma(): PrismaService {
    if (prisma === undefined) throw new Error('Prisma test client is not initialized');
    return prisma;
  }
});
