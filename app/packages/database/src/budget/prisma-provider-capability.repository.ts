import { Injectable } from '@nestjs/common';
import {
  type AiModality,
  type EnvironmentTier,
  type ProviderCapabilityRegistrationDraft,
  type ProviderCapabilityRegistrationRecord,
  type ProviderCapabilityRepository,
} from '@parisian-shopper/application';
import { Prisma, type ProviderCapabilityRegistration } from '@prisma/client';
import { PrismaService } from '../prisma.service.js';

@Injectable()
export class PrismaProviderCapabilityRepository implements ProviderCapabilityRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async findCapability(
    providerId: string,
    modelId: string,
    environment: EnvironmentTier = 'DEVELOPMENT',
  ): Promise<ProviderCapabilityRegistrationRecord | null> {
    const found = await this.prisma.providerCapabilityRegistration.findUnique({
      where: {
        providerId_modelId_environment: {
          providerId,
          modelId,
          environment: environment,
        },
      },
    });

    if (!found) return null;
    return this.mapCapability(found);
  }

  public async listActiveCapabilities(
    modality?: AiModality,
    environment: EnvironmentTier = 'DEVELOPMENT',
  ): Promise<readonly ProviderCapabilityRegistrationRecord[]> {
    const where: Prisma.ProviderCapabilityRegistrationWhereInput = {
      active: true,
      environment: environment,
    };
    if (modality) {
      where.modality = modality;
    }

    const records = await this.prisma.providerCapabilityRegistration.findMany({
      where,
      orderBy: { providerId: 'asc' },
    });

    return records.map((r) => this.mapCapability(r));
  }

  public async registerCapability(
    draft: ProviderCapabilityRegistrationDraft,
  ): Promise<ProviderCapabilityRegistrationRecord> {
    const env = draft.environment ?? 'DEVELOPMENT';

    const registered = await this.prisma.providerCapabilityRegistration.upsert({
      where: {
        providerId_modelId_environment: {
          providerId: draft.providerId,
          modelId: draft.modelId,
          environment: env,
        },
      },
      create: {
        id: draft.id,
        providerId: draft.providerId,
        modelId: draft.modelId,
        modality: draft.modality,
        supportedCapabilities: [...draft.supportedCapabilities],
        environment: env,
        supportsIdempotency: draft.supportsIdempotency ?? true,
        active: draft.active ?? true,
      },
      update: {
        supportedCapabilities: [...draft.supportedCapabilities],
        supportsIdempotency: draft.supportsIdempotency ?? true,
        active: draft.active ?? true,
      },
    });

    return this.mapCapability(registered);
  }

  private mapCapability(c: ProviderCapabilityRegistration): ProviderCapabilityRegistrationRecord {
    return {
      id: c.id,
      providerId: c.providerId,
      modelId: c.modelId,
      modality: c.modality,
      supportedCapabilities: c.supportedCapabilities,
      environment: c.environment,
      supportsIdempotency: c.supportsIdempotency,
      active: c.active,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    };
  }
}
