#!/usr/bin/env node
/**
 * Parisian Shopper AI — Rich Demo Seeder for Geparlys Perfumes & Operational Workflows
 *
 * Populates real Geparlys Paris luxury perfumes, campaigns, content jobs (Draft, Under Review, Approved),
 * validation results, 4-Eyes approval events, creative scenes, and publishing records.
 */

import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '..');

const { PrismaClient } = await import(
  path.join(appRoot, 'packages/database/node_modules/@prisma/client/index.js')
);

const prisma = new PrismaClient();

async function main() {
  console.log('--- SEEDING RICH GEPARLYS PERFUME DATA & OPERATIONS ---');
  await prisma.$connect();

  // 1. Get Active Brand Rule Version
  const activeBrand = await prisma.brandRuleVersion.findFirst({
    where: { status: 'ACTIVE' },
  });
  if (!activeBrand) {
    throw new Error('No active brand rule version found. Run seed-demo-data.mjs first.');
  }
  console.log(`Using active brand rule: ${activeBrand.name} (${activeBrand.id})`);

  // 2. Fetch or create roles
  const roles = await prisma.role.findMany();
  const roleMap = new Map(roles.map((r) => [r.code, r.id]));

  // Ensure Admin user
  let adminUser = await prisma.user.findFirst({
    where: { displayName: 'Administrator' },
  });
  if (!adminUser) {
    adminUser = await prisma.user.create({
      data: { displayName: 'Administrator', status: 'ACTIVE' },
    });
  }

  // Ensure Sophie (Content Creator)
  let sophie = await prisma.user.findFirst({
    where: { displayName: 'Sophie Vicheka (Content Specialist)' },
  });
  if (!sophie) {
    sophie = await prisma.user.create({
      data: {
        displayName: 'Sophie Vicheka (Content Specialist)',
        status: 'ACTIVE',
      },
    });
    if (roleMap.has('MARKETING_EDITOR')) {
      await prisma.userRole.create({
        data: { userId: sophie.id, roleId: roleMap.get('MARKETING_EDITOR') },
      });
    }
  }

  // Ensure Marc (Reviewer / Director)
  let marc = await prisma.user.findFirst({
    where: { displayName: 'Marc Delacroix (Creative Director)' },
  });
  if (!marc) {
    marc = await prisma.user.create({
      data: {
        displayName: 'Marc Delacroix (Creative Director)',
        status: 'ACTIVE',
      },
    });
    if (roleMap.has('MARKETING_APPROVER')) {
      await prisma.userRole.create({
        data: { userId: marc.id, roleId: roleMap.get('MARKETING_APPROVER') },
      });
    }
  }

  // 3. Campaigns
  const royalCampaign = await prisma.campaign.upsert({
    where: { code: 'CAMP-GEPARLYS-ROYAL-2026' },
    update: {},
    create: {
      code: 'CAMP-GEPARLYS-ROYAL-2026',
      name: 'Geparlys Royal Collection Launch',
      objective: 'Establish Geparlys Yes I Am The King as the flagship masculine luxury fragrance for Q4 2026 in Phnom Penh',
      description: 'Exclusive Phnom Penh launch campaign for Yes I Am The King EDP and Le Parfum',
      status: 'ACTIVE',
      startDate: new Date('2026-11-01T00:00:00Z'),
      endDate: new Date('2026-12-31T23:59:59Z'),
      createdById: adminUser.id,
    },
  });

  const summerCampaign = await prisma.campaign.upsert({
    where: { code: 'CAMP-PARISIAN-SUMMER-2026' },
    update: {},
    create: {
      code: 'CAMP-PARISIAN-SUMMER-2026',
      name: 'Parisian Summer Aromatics',
      objective: 'Promote light, floral Karen Low and Johan B. Eau de Parfums for the dry season',
      description: 'Fresh, vibrant summer fragrances featuring Karen Low and Johan B.',
      status: 'PLANNED',
      startDate: new Date('2026-12-01T00:00:00Z'),
      endDate: new Date('2027-01-31T23:59:59Z'),
      createdById: adminUser.id,
    },
  });

  console.log(`Campaigns ready: ${royalCampaign.name}, ${summerCampaign.name}`);

  // 4. Find Product Snapshots for Geparlys
  const snapshots = await prisma.productSnapshot.findMany({
    orderBy: { createdAt: 'desc' },
  });
  const snapshotMap = new Map();
  for (const s of snapshots) {
    if (s.sku && !snapshotMap.has(s.sku)) {
      snapshotMap.set(s.sku, s);
    }
  }

  console.log(`Found ${snapshotMap.size} distinct product SKUs in snapshot database.`);

  const kingEdp = snapshotMap.get('GEP-KING-EDP-100');
  const kingPrf = snapshotMap.get('GEP-KING-PRF-100');
  const unpNoir = snapshotMap.get('GEP-UNP-NOIR-100');
  const pureCouture = snapshotMap.get('GEP-KL-COU-100');
  const beSeduced = snapshotMap.get('GEP-JOH-SED-085');

  if (!kingEdp || !kingPrf) {
    console.error('Missing key Geparlys product snapshots. Check seed-demo-data.mjs.');
    return;
  }

  // Link products to campaigns
  const linkProduct = async (campaignId, snapshotId, isHero, sortOrder) => {
    await prisma.campaignProduct.upsert({
      where: {
        campaignId_productSnapshotId: {
          campaignId,
          productSnapshotId: snapshotId,
        },
      },
      update: {},
      create: {
        campaignId,
        productSnapshotId: snapshotId,
        isHero,
        sortOrder,
      },
    });
  };

  await linkProduct(royalCampaign.id, kingEdp.id, true, 0);
  await linkProduct(royalCampaign.id, kingPrf.id, false, 1);
  if (unpNoir) await linkProduct(royalCampaign.id, unpNoir.id, false, 2);
  if (pureCouture) await linkProduct(summerCampaign.id, pureCouture.id, true, 0);
  if (beSeduced) await linkProduct(summerCampaign.id, beSeduced.id, false, 1);

  // Helper to create content version + attempt + validation
  async function createFullContentJob({
    productSnapshot,
    campaign,
    status,
    contentType,
    language,
    platform,
    headline,
    bodyKm,
    bodyEn,
    ctaKm,
    ctaEn,
    notes,
    hashtags,
    approverUser = null,
  }) {
    const existing = await prisma.contentJob.findFirst({
      where: {
        productSnapshotId: productSnapshot.id,
        campaignId: campaign?.id ?? null,
        contentType,
      },
    });

    if (existing) {
      console.log(`Job already exists for ${productSnapshot.productSku} (${existing.id}), skipping creation.`);
      const existingVersion = await prisma.contentVersion.findFirst({
        where: { contentJobId: existing.id },
      });
      return { job: existing, version: existingVersion };
    }

    const job = await prisma.contentJob.create({
      data: {
        productSnapshotId: productSnapshot.id,
        brandRuleVersionId: activeBrand.id,
        requesterUserId: sophie.id,
        campaignId: campaign?.id,
        contentType,
        language,
        platform,
        campaignContext: `Luxury promotion for ${productSnapshot.productName} in Phnom Penh retail outlets.`,
        status,
      },
    });

    const attempt = await prisma.generationAttempt.create({
      data: {
        contentJobId: job.id,
        attemptNumber: 1,
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-20241022',
        promptVersion: 'prompts/content-generation:v2.1',
        status: 'SUCCEEDED',
        startedAt: new Date(Date.now() - 3600000),
        completedAt: new Date(Date.now() - 3590000),
        latencyMs: 1420,
        inputTokenCount: 1840,
        outputTokenCount: 380,
        totalTokenCount: 2220,
        estimatedCost: 0.0084,
      },
    });

    const structuredOutput = {
      headline,
      bodyKm,
      bodyEn,
      ctaKm,
      ctaEn,
      notes,
      hashtags,
      sku: productSnapshot.productSku,
      productName: productSnapshot.productName,
      price: productSnapshot.price,
      currency: productSnapshot.currency,
    };

    const version = await prisma.contentVersion.create({
      data: {
        contentJobId: job.id,
        versionNumber: 1,
        brandRuleVersionId: activeBrand.id,
        productSnapshotId: productSnapshot.id,
        generationAttemptId: attempt.id,
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-20241022',
        promptVersion: 'prompts/content-generation:v2.1',
        structuredOutput,
      },
    });

    const valResult = await prisma.validationResult.create({
      data: {
        contentVersionId: version.id,
        validatorVersion: 'factual-validator:v1.4',
        status: 'PASSED',
        findingCount: 0,
        blockingCount: 0,
        warningCount: 0,
        infoCount: 1,
      },
    });

    // If approved, create approval event
    if (status === 'APPROVED' && approverUser) {
      await prisma.approvalEvent.create({
        data: {
          contentJobId: job.id,
          contentVersionId: version.id,
          approverUserId: approverUser.id,
          decision: 'APPROVED',
          comment: 'Exquisite bilingual luxury phrasing adhering fully to Parisian Shopper editorial guidelines.',
          validationResultId: valResult.id,
        },
      });
    }

    console.log(`Created ContentJob [${status}] for ${productSnapshot.productSku} (Job ID: ${job.id})`);
    return { job, version };
  }

  // 1. King EDP: APPROVED + Published to Telegram
  const kingEdpResult = await createFullContentJob({
    productSnapshot: kingEdp,
    campaign: royalCampaign,
    status: 'APPROVED',
    contentType: 'PRODUCT_SPOTLIGHT',
    language: 'BILINGUAL',
    platform: 'TELEGRAM',
    headline: 'Yes I Am The King — The Sovereign Scent of Paris',
    bodyKm: 'ស្វែងរកភាពថ្លៃថ្នូរ និងអំណាចនៃក្លិនក្រអូបពីប៉ារីសជាមួយ Yes I Am The King Eau de Parfum។ ផ្សំឡើងពីផ្លែក្រូចឆ្មាស្រស់ និងឈើក្រអូបដ៏ប្រណិត សាកសមបំផុតសម្រាប់សុភាពបុរសជោគជ័យ។',
    bodyEn: 'Command every room with Yes I Am The King Eau de Parfum by Geparlys Paris. A radiant burst of Sicilian bergamot settles into noble cedarwood and amber.',
    ctaKm: 'កុម្ម៉ង់ទិញឥឡូវនេះនៅ Parisian Shopper (ដឹកជញ្ជូនរហ័សទូទាំងប្រទេសកម្ពុជា)',
    ctaEn: 'Order directly with Parisian Shopper. Complimentary nationwide express delivery in Cambodia.',
    notes: 'Top: Bergamot, Grapefruit | Heart: Geranium, Lavender | Base: Amber, Cedarwood, Vetiver',
    hashtags: ['#GeparlysParis', '#YesIAmTheKing', '#ParisianShopper', '#PhnomPenhLuxury', '#PerfumeCambodia'],
    approverUser: marc,
  });

  // Create Publication for King EDP if approved
  if (kingEdpResult?.version) {
    const pubKey = `pub-${kingEdpResult.job.id}-v1-tg`;
    const existingPub = await prisma.publication.findUnique({
      where: { idempotencyKey: pubKey },
    });
    if (!existingPub) {
      await prisma.publication.create({
        data: {
          contentVersionId: kingEdpResult.version.id,
          destinationChannel: 'TELEGRAM_CHANNEL',
          destinationAccountId: '@parisian_shopper_luxury',
          requestedByUserId: sophie.id,
          status: 'PUBLISHED',
          idempotencyKey: pubKey,
          campaignId: royalCampaign.id,
          publishedAt: new Date(Date.now() - 7200000),
          externalPublicationId: 'tg_msg_8849201',
        },
      });
      console.log('Created published Telegram record for King EDP.');
    }

    // Creative Job & Scene for King EDP
    let cJob = await prisma.creativeJob.findFirst({
      where: { contentVersionId: kingEdpResult.version.id },
    });
    if (!cJob) {
      cJob = await prisma.creativeJob.create({
        data: {
          contentVersionId: kingEdpResult.version.id,
          productSnapshotId: kingEdp.id,
          brandRuleVersionId: activeBrand.id,
          requestedByUserId: sophie.id,
          status: 'CREATIVE_APPROVED',
          targetPlatform: 'TELEGRAM',
          aspectRatio: '1:1',
          creativeProfile: 'PARISIAN_LUXURY_ATELIER',
        },
      });

      const scene = await prisma.creativeScene.create({
        data: {
          creativeJobId: cJob.id,
          campaignId: royalCampaign.id,
          title: 'Yes I Am The King — Royal Blue Edition Poster',
          currentVersionNumber: 1,
        },
      });

      const sceneHash = crypto.randomBytes(32).toString('hex');
      const depHash = crypto.randomBytes(32).toString('hex');

      await prisma.creativeSceneVersion.create({
        data: {
          sceneId: scene.id,
          versionNumber: 1,
          aspectRatio: '1:1',
          width: 1080,
          height: 1080,
          templateId: 'haussmann-editorial',
          templateVersion: '1.0.0',
          language: 'BILINGUAL',
          safeMargins: { top: 72, bottom: 96, left: 72, right: 72 },
          brandProfileVersionId: activeBrand.id,
          sourceContentVersionId: kingEdpResult.version.id,
          productSnapshotId: kingEdp.id,
          sceneHash,
          dependencyHash: depHash,
          changeReason: 'Initial verified Haussmann editorial creative layout',
          operationCode: 'CREATE',
          requestedByUserId: sophie.id,
        },
      });
      console.log('Created Creative Project and Scene for King EDP.');
    }
  }

  // 2. King Le Parfum: UNDER_REVIEW (Populates Four-Eyes Approval Desk!)
  await createFullContentJob({
    productSnapshot: kingPrf,
    campaign: royalCampaign,
    status: 'UNDER_REVIEW',
    contentType: 'PRODUCT_SPOTLIGHT',
    language: 'BILINGUAL',
    platform: 'TELEGRAM',
    headline: 'Yes I Am The King Le Parfum — The Ultimate Concentration of Royalty',
    bodyKm: 'កម្រិតកំហាប់ Parfum ដ៏វិសេសវិសាល! Yes I Am The King Le Parfum ផ្ដល់នូវក្លិនឈ្ងុយជាប់បានយូរជាង ២៤ ម៉ោង ជាមួយក្លិនក្រអូបបែបអភិជន។',
    bodyEn: 'Intense, magnetic, and deeply opulent. Yes I Am The King Le Parfum represents the zenith of the royal line, with rich leather, warm resin, and tonka bean.',
    ctaKm: 'ពិគ្រោះជាមួយអ្នកឯកទេសក្លិនក្រអូបរបស់យើងឥឡូវនេះ',
    ctaEn: 'Consult our Parisian fragrance specialists today.',
    notes: 'Top: Apple, Bergamot, Cardamom | Heart: Iris, Violet, Coriander | Base: Tonka Bean, Leather, Guaiac Wood',
    hashtags: ['#YesIAmTheKing', '#LeParfum', '#GeparlysCambodia', '#HauteParfumerie'],
  });

  // 3. Glenn Perri Unpredictable Noir: UNDER_REVIEW (Second item in Review Desk!)
  if (unpNoir) {
    await createFullContentJob({
      productSnapshot: unpNoir,
      campaign: royalCampaign,
      status: 'UNDER_REVIEW',
      contentType: 'SCENT_PYRAMID',
      language: 'BILINGUAL',
      platform: 'FACEBOOK',
      headline: 'Unpredictable Noir — Parisian Seduction After Dark',
      bodyKm: 'Glenn Perri Unpredictable Noir បង្ហាញពីអាថ៌កំបាំងរាត្រីនៅទីក្រុងប៉ារីស។ ក្លិនឈើក្រអូប និងគ្រឿងទេសក្ដៅឧណ្ហៗ បង្កើតបាននូវភាពទាក់ទាញដែលមិនអាចទាយទុកជាមុនបាន។',
      bodyEn: 'When twilight embraces Paris, Unpredictable Noir awakens. An alluring, mysterious blend of midnight amber, black pepper, and precious woods.',
      ctaKm: 'ទទួលបានការបញ្ចុះតម្លៃពិសេសសម្រាប់ការកុម្ម៉ង់មុន',
      ctaEn: 'Discover your signature nighttime fragrance at Parisian Shopper.',
      notes: 'Top: Cardamom, Black Pepper | Heart: Smoked Incense, Nutmeg | Base: Dark Amber, Vanilla, Patchouli',
      hashtags: ['#GlennPerri', '#UnpredictableNoir', '#ParisianShopper', '#LuxuryNight'],
    });
  }

  // 4. Karen Low Pure Couture: APPROVED + QUEUED
  if (pureCouture) {
    const coutureResult = await createFullContentJob({
      productSnapshot: pureCouture,
      campaign: summerCampaign,
      status: 'APPROVED',
      contentType: 'PRODUCT_SPOTLIGHT',
      language: 'EN',
      platform: 'INSTAGRAM',
      headline: 'Pure Couture — The Essence of Parisian High Fashion',
      bodyKm: 'សម្រស់នៃម៉ូដសម្លៀកបំពាក់ជាន់ខ្ពស់នៅប៉ារីស ត្រូវបានចម្រាញ់ចូលក្នុង Karen Low Pure Couture។ ក្លិនផ្កាស្រស់ស្រាយ និងទន់ភ្លន់។',
      bodyEn: 'Woven with the finesse of French Haute Couture, Pure Couture envelops you in peony petals, juicy white peach, and silken white musk.',
      ctaKm: 'ទិញឥឡូវនេះដើម្បីទទួលបានកាដូពិសេស',
      ctaEn: 'Embrace effortless elegance. Shop now with nationwide delivery.',
      notes: 'Top: White Peach, Mandarin | Heart: Peony, Pink Lily | Base: White Musk, Sandalwood',
      hashtags: ['#KarenLow', '#PureCouture', '#FrenchPerfume', '#SummerScent'],
      approverUser: marc,
    });

    if (coutureResult?.version) {
      const pubKey = `pub-${coutureResult.job.id}-v1-ig`;
      const existingPub = await prisma.publication.findUnique({
        where: { idempotencyKey: pubKey },
      });
      if (!existingPub) {
        await prisma.publication.create({
          data: {
            contentVersionId: coutureResult.version.id,
            destinationChannel: 'INSTAGRAM',
            destinationAccountId: '@parisian_shopper',
            requestedByUserId: sophie.id,
            status: 'QUEUED',
            idempotencyKey: pubKey,
            campaignId: summerCampaign.id,
            scheduledAt: new Date(Date.now() + 86400000), // Tomorrow
          },
        });
        console.log('Created queued Instagram publication for Pure Couture.');
      }
    }
  }

  // 5. Johan B. Be Seduced: DRAFT
  if (beSeduced) {
    await createFullContentJob({
      productSnapshot: beSeduced,
      campaign: summerCampaign,
      status: 'DRAFT',
      contentType: 'PROMOTION',
      language: 'KM',
      platform: 'TELEGRAM',
      headline: 'Be Seduced — ភាពផ្អែមល្ហែម និងទាក់ទាញដែលមិនអាចបំភ្លេចបាន',
      bodyKm: 'Johan B. Be Seduced Eau de Parfum ជាជម្រើសដ៏ល្អឥតខ្ចោះសម្រាប់នារីសម័យថ្មី។ ក្លិនផ្កា និងផ្លែឈើក្រអូបឈ្ងុយឈ្ងប់ ផ្ដល់នូវទំនុកចិត្តពេញមួយថ្ងៃ។',
      bodyEn: 'Sweet, charming, and irresistible. Johan B. Be Seduced captures youthful Parisian enchantment in an unforgettable bottle.',
      ctaKm: 'ទាក់ទងមកយើងឥឡូវនេះដើម្បីសាកល្បងតេស្តក្លិន',
      ctaEn: 'Sample and purchase at our Parisian Shopper showroom.',
      notes: 'Top: Sweet Praline, Bergamot | Heart: Rose, Jasmine | Base: Vanilla, Musk',
      hashtags: ['#JohanB', '#BeSeduced', '#ParisianShopper'],
    });
  }

  console.log('\n--- GEPARLYS SEEDING COMPLETE! ALL WORKFLOWS HYDRATED! ---');
}

main()
  .catch((e) => {
    console.error('Error during seeding:', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
