import { Inject, Injectable } from '@nestjs/common';
import type { BrandProfileVersionRecord } from '../domain/brand-profile.types.js';
import {
  BRAND_PROFILE_REPOSITORY,
  type BrandProfileRepository,
} from './brand-profile.repository.js';

@Injectable()
export class ListBrandProfilesUseCase {
  public constructor(
    @Inject(BRAND_PROFILE_REPOSITORY)
    private readonly brandProfileRepo: BrandProfileRepository,
  ) {}

  public async execute(): Promise<readonly BrandProfileVersionRecord[]> {
    return this.brandProfileRepo.listProfiles();
  }
}
