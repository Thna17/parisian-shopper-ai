import {
  type AiModality,
  type EnvironmentTier,
  type ProviderCapabilityRegistrationRecord,
} from '../../domain/budget.types.js';

export const PROVIDER_CAPABILITY_REPOSITORY = Symbol('PROVIDER_CAPABILITY_REPOSITORY');

export interface ProviderCapabilityRegistrationDraft {
  readonly id: string;
  readonly providerId: string;
  readonly modelId: string;
  readonly modality: AiModality;
  readonly supportedCapabilities: readonly string[];
  readonly environment?: EnvironmentTier | undefined;
  readonly supportsIdempotency?: boolean | undefined;
  readonly active?: boolean | undefined;
}

export interface ProviderCapabilityRepository {
  findCapability(
    providerId: string,
    modelId: string,
    environment?: EnvironmentTier,
  ): Promise<ProviderCapabilityRegistrationRecord | null>;

  listActiveCapabilities(
    modality?: AiModality,
    environment?: EnvironmentTier,
  ): Promise<readonly ProviderCapabilityRegistrationRecord[]>;

  registerCapability(
    draft: ProviderCapabilityRegistrationDraft,
  ): Promise<ProviderCapabilityRegistrationRecord>;
}
