import { Module } from '@nestjs/common';
import { ActivateBrandProfileUseCase } from './application/activate-brand-profile.use-case.js';
import { AssembleBrandBriefUseCase } from './application/assemble-brand-brief.use-case.js';
import { CreateBrandProfileDraftUseCase } from './application/create-brand-profile-draft.use-case.js';
import { EvaluateCandidateOriginalityUseCase } from './application/evaluate-candidate-originality.use-case.js';
import { GetActiveBrandProfileUseCase } from './application/get-active-brand-profile.use-case.js';
import { IngestBrandSourceUseCase } from './application/ingest-brand-source.use-case.js';
import { ListBrandProfilesUseCase } from './application/list-brand-profiles.use-case.js';
import { RollbackBrandProfileUseCase } from './application/rollback-brand-profile.use-case.js';

export const BRAND_USE_CASES = [
  ActivateBrandProfileUseCase,
  AssembleBrandBriefUseCase,
  CreateBrandProfileDraftUseCase,
  EvaluateCandidateOriginalityUseCase,
  GetActiveBrandProfileUseCase,
  IngestBrandSourceUseCase,
  ListBrandProfilesUseCase,
  RollbackBrandProfileUseCase,
];

@Module({
  providers: [...BRAND_USE_CASES],
  exports: [...BRAND_USE_CASES],
})
export class BrandModule {}
