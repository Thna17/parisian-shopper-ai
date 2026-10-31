import { Inject, Injectable } from '@nestjs/common';
import type { BrandBrief, BrandProfileVersionRecord } from '../domain/brand-profile.types.js';
import {
  BRAND_PROFILE_REPOSITORY,
  type BrandProfileRepository,
} from './brand-profile.repository.js';

export interface AssembleBrandBriefInput {
  readonly productSnapshot?: {
    readonly sku: string;
    readonly productName: string;
    readonly brand: string;
  };
  readonly campaignContext?: string;
}

@Injectable()
export class AssembleBrandBriefUseCase {
  public constructor(
    @Inject(BRAND_PROFILE_REPOSITORY)
    private readonly brandProfileRepo: BrandProfileRepository,
  ) {}

  public async execute(input: AssembleBrandBriefInput = {}): Promise<BrandBrief> {
    const activeProfile = await this.brandProfileRepo.findActive();

    if (activeProfile) {
      return this.fromActiveProfile(activeProfile, input);
    }

    return this.createDeterministicFallback(input);
  }

  private fromActiveProfile(
    profile: BrandProfileVersionRecord,
    input: AssembleBrandBriefInput,
  ): BrandBrief {
    return {
      brandProfileVersionId: profile.id,
      versionNumber: profile.versionNumber,
      luxuryToneDirectives: profile.toneRules.luxuryAttributes,
      forbiddenVocabulary: [
        ...profile.toneRules.prohibitedHyperbole,
        ...profile.prohibitedPatterns,
      ],
      languageGuidance: {
        formality: profile.languagePolicy.formality,
        primaryScript: profile.languagePolicy.primaryLanguage,
        emojiAllowance: profile.toneRules.maxEmojisPerPost,
      },
      visualDirectives: {
        recommendedPalettes: profile.visualAestheticRules.approvedColorPalettes.map((p) => p.name),
        approvedLighting: profile.visualAestheticRules.lightingStyles,
      },
      ...(input.productSnapshot ? { productContext: input.productSnapshot } : {}),
      assembledAt: new Date().toISOString(),
    };
  }

  private createDeterministicFallback(input: AssembleBrandBriefInput): BrandBrief {
    return {
      brandProfileVersionId: 'fallback-deterministic-v1',
      versionNumber: 1,
      luxuryToneDirectives: [
        'Elegantly understated Parisian luxury',
        'Sensorial fragrance notes and artisanal craftsmanship',
        'Refined and authentic Cambodian cultural resonance',
      ],
      forbiddenVocabulary: [
        'cheap',
        'bargain',
        'discount frenzy',
        'lowest price guaranteed',
        'unbeatable clearance',
      ],
      languageGuidance: {
        formality: 'LUXURY_FORMAL',
        primaryScript: 'BILINGUAL',
        emojiAllowance: 2,
      },
      visualDirectives: {
        recommendedPalettes: ['Haussmann Classic Gold & Ivory', 'Nocturne Midnight Indigo'],
        approvedLighting: ['Soft diffused morning window light', 'Golden hour gentle backlight'],
      },
      ...(input.productSnapshot ? { productContext: input.productSnapshot } : {}),
      assembledAt: new Date().toISOString(),
    };
  }
}
