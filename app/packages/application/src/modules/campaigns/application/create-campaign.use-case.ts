import { Inject, Injectable } from '@nestjs/common';
import {
  CAMPAIGN_REPOSITORY,
  type CampaignDetail,
  type CampaignRepository,
  type CreateCampaignInput,
} from './campaign.repository.js';
import {
  DuplicateCampaignCodeError,
  InvalidCampaignDateRangeError,
} from '../domain/campaign-errors.js';
import { CampaignStatus } from '../domain/campaign.types.js';

export interface CreateCampaignCommand {
  readonly code: string;
  readonly name: string;
  readonly objective: string;
  readonly description?: string | null | undefined;
  readonly startDate?: Date | null | undefined;
  readonly endDate?: Date | null | undefined;
  readonly createdById: string;
}

@Injectable()
export class CreateCampaignUseCase {
  public constructor(
    @Inject(CAMPAIGN_REPOSITORY)
    private readonly campaignRepository: CampaignRepository,
  ) {}

  public async execute(command: CreateCampaignCommand): Promise<CampaignDetail> {
    const code = command.code.trim().toUpperCase();

    // Check date consistency
    if (command.startDate && command.endDate) {
      if (new Date(command.endDate).getTime() < new Date(command.startDate).getTime()) {
        throw new InvalidCampaignDateRangeError();
      }
    }

    // Check code uniqueness
    const existing = await this.campaignRepository.findByCode(code);
    if (existing) {
      throw new DuplicateCampaignCodeError(code);
    }

    const input: CreateCampaignInput = {
      code,
      name: command.name.trim(),
      objective: command.objective.trim(),
      description: command.description?.trim() || null,
      status: CampaignStatus.DRAFT,
      startDate: command.startDate ? new Date(command.startDate) : null,
      endDate: command.endDate ? new Date(command.endDate) : null,
      createdById: command.createdById,
    };

    return this.campaignRepository.create(input);
  }
}
