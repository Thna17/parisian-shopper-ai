import {
  type RevisionInterpretationResult,
  type RevisionPlan,
  RevisionExecutionStrategy,
  RevisionInterpretationConfidence,
  RevisionTargetType,
  type TargetMutation,
} from './revision-plan.types.js';
import { createRevisionPlan } from './revision-plan.js';
import { SelectiveInvalidationEngine } from './selective-invalidation.engine.js';

export interface ParseRevisionInstructionInput {
  readonly rawInstruction: string;
  readonly creativeJobId: string;
  readonly baseVersionNumber: number;
  readonly requestedByUserId: string;
  readonly currentSceneDigests?: Readonly<Record<string, string>> | undefined;
}

export class RevisionGrammarParser {
  private readonly invalidationEngine: SelectiveInvalidationEngine;

  public constructor(invalidationEngine?: SelectiveInvalidationEngine) {
    this.invalidationEngine = invalidationEngine ?? new SelectiveInvalidationEngine();
  }

  public parse(input: ParseRevisionInstructionInput): RevisionInterpretationResult {
    const raw = input.rawInstruction.trim();

    if (!raw) {
      return {
        confidence: RevisionInterpretationConfidence.UNSUPPORTED,
        confidenceScore: 0,
        rawInstruction: raw,
        explanation: 'Revision instruction is empty.',
        suggestedAlternatives: [
          'Headline: <text>',
          'Price: <amount>',
          'Style: <morning|dusk|minimal>',
          'Align: <left|center|right>',
        ],
      };
    }

    // --- Tier 1: Deterministic Pattern Grammar ---
    const tier1Result = this.matchTier1(raw);
    if (tier1Result) {
      const plan = this.buildPlanFromMatch({
        input,
        mutations: tier1Result.mutations,
        confidence: RevisionInterpretationConfidence.CONFIDENT,
        confidenceScore: 1.0,
        requiresConfirmation: tier1Result.requiresConfirmation,
        confirmationReason: tier1Result.confirmationReason,
      });

      return {
        confidence: RevisionInterpretationConfidence.CONFIDENT,
        confidenceScore: 1.0,
        rawInstruction: raw,
        proposedPlan: plan,
        explanation: `Deterministic grammar matched: target "${tier1Result.mutations[0]?.target}".`,
      };
    }

    // --- Tier 2: Semantic Intent Matcher ---
    const tier2Result = this.matchTier2(raw);
    if (tier2Result) {
      const plan = this.buildPlanFromMatch({
        input,
        mutations: tier2Result.mutations,
        confidence: tier2Result.confidence,
        confidenceScore: tier2Result.confidenceScore,
        requiresConfirmation: tier2Result.requiresConfirmation,
        confirmationReason: tier2Result.confirmationReason,
      });

      return {
        confidence: tier2Result.confidence,
        confidenceScore: tier2Result.confidenceScore,
        rawInstruction: raw,
        proposedPlan: plan,
        explanation: tier2Result.explanation,
        ...(tier2Result.alternatives ? { suggestedAlternatives: tier2Result.alternatives } : {}),
      };
    }

    // --- Unsupported ---
    return {
      confidence: RevisionInterpretationConfidence.UNSUPPORTED,
      confidenceScore: 0.1,
      rawInstruction: raw,
      explanation: `Could not interpret instruction "${raw}" into structured revision targets.`,
      suggestedAlternatives: [
        'Headline: <new headline>',
        'Subhead: <new subhead>',
        'Price: <new price>',
        'Style: <haussmann|nocturne|minimal>',
        'Align: <left|center|right>',
        'New Background',
      ],
    };
  }

  private matchTier1(raw: string): {
    readonly mutations: readonly TargetMutation[];
    readonly requiresConfirmation?: boolean | undefined;
    readonly confirmationReason?: string | undefined;
  } | null {
    // 1. Headline / Title
    const headlineMatch = /^(?:headline|title):\s*(.+)$/i.exec(raw);
    if (headlineMatch?.[1]) {
      return {
        mutations: [
          {
            target: RevisionTargetType.HEADLINE,
            fieldName: 'headline',
            requestedValue: headlineMatch[1].trim(),
          },
        ],
      };
    }

    // 2. Subhead / Tagline
    const subheadMatch = /^(?:subhead|tagline):\s*(.+)$/i.exec(raw);
    if (subheadMatch?.[1]) {
      return {
        mutations: [
          {
            target: RevisionTargetType.SUBHEAD,
            fieldName: 'subhead',
            requestedValue: subheadMatch[1].trim(),
          },
        ],
      };
    }

    // 3. Price
    const priceMatch = /^(?:price):\s*(.+)$/i.exec(raw);
    if (priceMatch?.[1]) {
      return {
        mutations: [
          {
            target: RevisionTargetType.PRICE,
            fieldName: 'price',
            requestedValue: priceMatch[1].trim(),
          },
        ],
      };
    }

    // 4. Promotional Price
    const promoMatch = /^(?:promo|promotional\s*price|discount\s*price|badge):\s*(.+)$/i.exec(raw);
    if (promoMatch?.[1]) {
      return {
        mutations: [
          {
            target: RevisionTargetType.PROMOTIONAL_PRICE,
            fieldName: 'promotionalPrice',
            requestedValue: promoMatch[1].trim(),
          },
        ],
      };
    }

    // 5. CTA
    const ctaMatch = /^(?:cta|button):\s*(.+)$/i.exec(raw);
    if (ctaMatch?.[1]) {
      return {
        mutations: [
          {
            target: RevisionTargetType.CTA,
            fieldName: 'cta',
            requestedValue: ctaMatch[1].trim(),
          },
        ],
      };
    }

    // 6. Language
    const langMatch = /^(?:lang|language):\s*(en|km|bilingual)$/i.exec(raw);
    if (langMatch?.[1]) {
      return {
        mutations: [
          {
            target: RevisionTargetType.LANGUAGE,
            fieldName: 'language',
            requestedValue: langMatch[1].toUpperCase(),
          },
        ],
      };
    }

    // 7. Template / Layout
    const tplMatch =
      /^(?:layout|template):\s*(editorial(?:_split)?|centered(?:_hero)?|hero|khmer(?:_seasonal)?|scent(?:_story)?|promo(?:tion_price_cta)?)$/i.exec(
        raw,
      );
    if (tplMatch?.[1]) {
      return {
        mutations: [
          {
            target: RevisionTargetType.TEMPLATE,
            fieldName: 'templateId',
            requestedValue: this.normalizeTemplateId(tplMatch[1]),
          },
        ],
      };
    }

    // 8. Style / Preset
    const styleMatch = /^(?:style|preset):\s*(.+)$/i.exec(raw);
    if (styleMatch?.[1]) {
      return {
        mutations: [
          {
            target: RevisionTargetType.STYLE_PRESET,
            fieldName: 'stylePreset',
            requestedValue: this.normalizeStylePreset(styleMatch[1]),
          },
        ],
        requiresConfirmation: true,
        confirmationReason: 'AI background generation requires credit confirmation.',
      };
    }

    // 9. New Background
    if (/^(?:new\s*background|regenerate\s*background|new\s*bg|regen\s*background)$/i.test(raw)) {
      return {
        mutations: [
          {
            target: RevisionTargetType.NEW_BACKGROUND,
            fieldName: 'background',
            requestedValue: 'NEW_BACKGROUND',
          },
        ],
        requiresConfirmation: true,
        confirmationReason: 'AI background generation requires credit confirmation.',
      };
    }

    // 10. Product Placement
    const placementMatch = /^(?:align|place\s*product|placement):\s*(left|center|right)$/i.exec(
      raw,
    );
    if (placementMatch?.[1]) {
      return {
        mutations: [
          {
            target: RevisionTargetType.PRODUCT_PLACEMENT,
            fieldName: 'productPlacement',
            requestedValue: placementMatch[1].toUpperCase(),
          },
        ],
      };
    }

    // 11. Product Scale
    const scaleMatch = /^(?:scale|size\s*product):\s*(\d+(?:\.\d+)?%?)$/i.exec(raw);
    if (scaleMatch?.[1]) {
      return {
        mutations: [
          {
            target: RevisionTargetType.PRODUCT_SCALE,
            fieldName: 'productScale',
            requestedValue: this.parseScale(scaleMatch[1]),
          },
        ],
      };
    }

    // 12. Aspect Ratio
    const aspectMatch = /^(?:aspect\s*ratio|format):\s*(1:1|4:5|9:16|16:9)$/i.exec(raw);
    if (aspectMatch?.[1]) {
      return {
        mutations: [
          {
            target: RevisionTargetType.ASPECT_RATIO,
            fieldName: 'aspectRatio',
            requestedValue: aspectMatch[1],
          },
        ],
      };
    }

    return null;
  }

  private matchTier2(raw: string): {
    readonly mutations: readonly TargetMutation[];
    readonly confidence: RevisionInterpretationConfidence;
    readonly confidenceScore: number;
    readonly requiresConfirmation: boolean;
    readonly confirmationReason?: string | undefined;
    readonly explanation: string;
    readonly alternatives?: readonly string[] | undefined;
  } | null {
    // 1. Natural Language Text Edits
    const changeHeadlineMatch =
      /^(?:change|set|update)\s+headline(?:\s+to)?\s*[:"]?\s*(.+?)["]?$/i.exec(raw);
    if (changeHeadlineMatch?.[1]) {
      return {
        mutations: [
          {
            target: RevisionTargetType.HEADLINE,
            fieldName: 'headline',
            requestedValue: changeHeadlineMatch[1].trim(),
          },
        ],
        confidence: RevisionInterpretationConfidence.CONFIDENT,
        confidenceScore: 0.95,
        requiresConfirmation: false,
        explanation: 'Natural language headline update recognized.',
      };
    }

    const changePriceMatch = /^(?:change|set|update)\s+price(?:\s+to)?\s*[:"]?\s*(.+?)["]?$/i.exec(
      raw,
    );
    if (changePriceMatch?.[1]) {
      return {
        mutations: [
          {
            target: RevisionTargetType.PRICE,
            fieldName: 'price',
            requestedValue: changePriceMatch[1].trim(),
          },
        ],
        confidence: RevisionInterpretationConfidence.CONFIDENT,
        confidenceScore: 0.95,
        requiresConfirmation: false,
        explanation: 'Natural language price update recognized.',
      };
    }

    const changeSubheadMatch =
      /^(?:change|set|update)\s+(?:subhead|tagline)(?:\s+to)?\s*[:"]?\s*(.+?)["]?$/i.exec(raw);
    if (changeSubheadMatch?.[1]) {
      return {
        mutations: [
          {
            target: RevisionTargetType.SUBHEAD,
            fieldName: 'subhead',
            requestedValue: changeSubheadMatch[1].trim(),
          },
        ],
        confidence: RevisionInterpretationConfidence.CONFIDENT,
        confidenceScore: 0.95,
        requiresConfirmation: false,
        explanation: 'Natural language subhead update recognized.',
      };
    }

    // 2. Natural Language Placement
    if (/(?:move|shift|place|align)\s+(?:bottle|product)?\s*(?:to\s+)?left/i.test(raw)) {
      return {
        mutations: [
          {
            target: RevisionTargetType.PRODUCT_PLACEMENT,
            fieldName: 'productPlacement',
            requestedValue: 'LEFT',
          },
        ],
        confidence: RevisionInterpretationConfidence.CONFIDENT,
        confidenceScore: 0.92,
        requiresConfirmation: false,
        explanation: 'Product alignment to LEFT recognized.',
      };
    }

    if (/(?:move|shift|place|align)\s+(?:bottle|product)?\s*(?:to\s+)?right/i.test(raw)) {
      return {
        mutations: [
          {
            target: RevisionTargetType.PRODUCT_PLACEMENT,
            fieldName: 'productPlacement',
            requestedValue: 'RIGHT',
          },
        ],
        confidence: RevisionInterpretationConfidence.CONFIDENT,
        confidenceScore: 0.92,
        requiresConfirmation: false,
        explanation: 'Product alignment to RIGHT recognized.',
      };
    }

    if (/(?:center|move\s+to\s+center|place\s+in\s+middle)\s*(?:bottle|product)?/i.test(raw)) {
      return {
        mutations: [
          {
            target: RevisionTargetType.PRODUCT_PLACEMENT,
            fieldName: 'productPlacement',
            requestedValue: 'CENTER',
          },
        ],
        confidence: RevisionInterpretationConfidence.CONFIDENT,
        confidenceScore: 0.92,
        requiresConfirmation: false,
        explanation: 'Product alignment to CENTER recognized.',
      };
    }

    // 3. Natural Language Scaling
    if (
      /(?:make\s+(?:bottle|product)\s+bigger|bigger\s+(?:bottle|product)|enlarge\s+(?:bottle|product)|increase\s+product\s+size)/i.test(
        raw,
      )
    ) {
      return {
        mutations: [
          {
            target: RevisionTargetType.PRODUCT_SCALE,
            fieldName: 'productScale',
            requestedValue: 1.2,
          },
        ],
        confidence: RevisionInterpretationConfidence.CONFIDENT,
        confidenceScore: 0.88,
        requiresConfirmation: false,
        explanation: 'Scale enlargement (+20%) recognized.',
      };
    }

    if (
      /(?:make\s+(?:bottle|product)\s+smaller|smaller\s+(?:bottle|product)|shrink\s+(?:bottle|product)|decrease\s+product\s+size)/i.test(
        raw,
      )
    ) {
      return {
        mutations: [
          {
            target: RevisionTargetType.PRODUCT_SCALE,
            fieldName: 'productScale',
            requestedValue: 0.8,
          },
        ],
        confidence: RevisionInterpretationConfidence.CONFIDENT,
        confidenceScore: 0.88,
        requiresConfirmation: false,
        explanation: 'Scale reduction (-20%) recognized.',
      };
    }

    // 4. Style & Ambiance Inferences (Ambiguous - requires confirmation!)
    if (/(?:evening|dusk|darker|night|sunset|dramatic)/i.test(raw)) {
      return {
        mutations: [
          {
            target: RevisionTargetType.STYLE_PRESET,
            fieldName: 'stylePreset',
            requestedValue: 'NOCTURNE_ROYALE',
          },
        ],
        confidence: RevisionInterpretationConfidence.AMBIGUOUS,
        confidenceScore: 0.78,
        requiresConfirmation: true,
        confirmationReason:
          'Ambiguous instruction inferred as Nocturne Royale evening style change (~4s, 1 GPU credit).',
        explanation: 'Inferred evening atmosphere matching Nocturne Royale preset.',
        alternatives: [
          'Style: ATELIER_HAUSSMANN',
          'Style: NOCTURNE_ROYALE',
          'Style: CLEAN_MINIMALIST',
        ],
      };
    }

    if (/(?:morning|dawn|lighter|bright|sunny|sunlight)/i.test(raw)) {
      return {
        mutations: [
          {
            target: RevisionTargetType.STYLE_PRESET,
            fieldName: 'stylePreset',
            requestedValue: 'PARISIAN_MORNING_ATELIER',
          },
        ],
        confidence: RevisionInterpretationConfidence.AMBIGUOUS,
        confidenceScore: 0.78,
        requiresConfirmation: true,
        confirmationReason:
          'Ambiguous instruction inferred as Parisian Morning Atelier style change (~4s, 1 GPU credit).',
        explanation: 'Inferred morning atmosphere matching Parisian Morning Atelier preset.',
        alternatives: ['Style: PARISIAN_MORNING_ATELIER', 'Style: CLASSIC_STUDIO'],
      };
    }

    if (/(?:minimal|clean|white|studio)/i.test(raw)) {
      return {
        mutations: [
          {
            target: RevisionTargetType.STYLE_PRESET,
            fieldName: 'stylePreset',
            requestedValue: 'CLASSIC_STUDIO',
          },
        ],
        confidence: RevisionInterpretationConfidence.AMBIGUOUS,
        confidenceScore: 0.8,
        requiresConfirmation: true,
        confirmationReason:
          'Ambiguous instruction inferred as Classic Studio style change (~4s, 1 GPU credit).',
        explanation: 'Inferred minimalist studio atmosphere matching Classic Studio preset.',
        alternatives: ['Style: CLASSIC_STUDIO', 'Style: PARISIAN_MORNING_ATELIER'],
      };
    }

    // 5. General Background Regeneration
    if (
      /(?:different\s+background|another\s+background|change\s+background|reroll\s+background)/i.test(
        raw,
      )
    ) {
      return {
        mutations: [
          {
            target: RevisionTargetType.NEW_BACKGROUND,
            fieldName: 'background',
            requestedValue: 'NEW_BACKGROUND',
          },
        ],
        confidence: RevisionInterpretationConfidence.CONFIDENT,
        confidenceScore: 0.9,
        requiresConfirmation: true,
        confirmationReason: 'Generates a new AI background scene (~4s, 1 GPU credit).',
        explanation: 'Background regeneration requested.',
      };
    }

    return null;
  }

  private buildPlanFromMatch(params: {
    readonly input: ParseRevisionInstructionInput;
    readonly mutations: readonly TargetMutation[];
    readonly confidence: RevisionInterpretationConfidence;
    readonly confidenceScore: number;
    readonly requiresConfirmation?: boolean | undefined;
    readonly confirmationReason?: string | undefined;
  }): RevisionPlan {
    const invalidation = this.invalidationEngine.assessInvalidation({
      mutations: params.mutations,
      currentDigests: params.input.currentSceneDigests,
    });

    const executionStrategy = this.deriveExecutionStrategy(params.mutations);

    return createRevisionPlan({
      creativeJobId: params.input.creativeJobId,
      baseVersionNumber: params.input.baseVersionNumber,
      requestedByUserId: params.input.requestedByUserId,
      rawInstruction: params.input.rawInstruction,
      executionStrategy,
      confidence: params.confidence,
      confidenceScore: params.confidenceScore,
      mutations: params.mutations,
      affectedLayerGroups: invalidation.affectedLayerGroups,
      preservedLayerDigests: invalidation.preservedLayerDigests,
      requiresConfirmation: params.requiresConfirmation,
      confirmationReason: params.confirmationReason,
    });
  }

  private deriveExecutionStrategy(mutations: readonly TargetMutation[]): RevisionExecutionStrategy {
    const hasAiBg = mutations.some(
      (m) =>
        m.target === RevisionTargetType.BACKGROUND_PROMPT ||
        m.target === RevisionTargetType.STYLE_PRESET ||
        m.target === RevisionTargetType.NEW_BACKGROUND,
    );
    if (hasAiBg) {
      return RevisionExecutionStrategy.AI_BACKGROUND_REGEN;
    }

    const hasProductAsset = mutations.some((m) => m.target === RevisionTargetType.PRODUCT_ASSET);
    if (hasProductAsset) {
      return RevisionExecutionStrategy.PRODUCT_ASSET_SWAP;
    }

    const hasAspect = mutations.some((m) => m.target === RevisionTargetType.ASPECT_RATIO);
    if (hasAspect) {
      return RevisionExecutionStrategy.CANVAS_REFORMAT;
    }

    return RevisionExecutionStrategy.ZERO_AI_COMPOSITE;
  }

  private normalizeTemplateId(templateInput: string): string {
    const upper = templateInput.toUpperCase().replace(/\s+/g, '_');
    if (upper.includes('EDITORIAL')) return 'EDITORIAL_SPLIT';
    if (upper.includes('CENTERED') || upper === 'HERO') return 'CENTERED_HERO';
    if (upper.includes('KHMER')) return 'KHMER_SEASONAL';
    if (upper.includes('SCENT')) return 'SCENT_STORY';
    if (upper.includes('PROMO')) return 'PROMOTION_PRICE_CTA';
    return upper;
  }

  private normalizeStylePreset(styleInput: string): string {
    const upper = styleInput.toUpperCase().replace(/\s+/g, '_');
    if (upper.includes('HAUSSMANN') || upper.includes('ATELIER') || upper.includes('MORNING')) {
      return 'PARISIAN_MORNING_ATELIER';
    }
    if (upper.includes('NOCTURNE') || upper.includes('DUSK') || upper.includes('ROYALE')) {
      return 'NOCTURNE_ROYALE';
    }
    if (upper.includes('MINIMAL') || upper.includes('STUDIO')) {
      return 'CLASSIC_STUDIO';
    }
    if (upper.includes('KHMER') || upper.includes('IVORY') || upper.includes('CAMBODIAN')) {
      return 'CAMBODIAN_IVORY';
    }
    if (upper.includes('PYRAMID') || upper.includes('BOTANICAL')) {
      return 'SCENT_PYRAMID';
    }
    return upper;
  }

  private parseScale(scaleInput: string): number {
    const cleaned = scaleInput.replace('%', '').trim();
    const val = Number.parseFloat(cleaned);
    if (Number.isNaN(val)) return 1.0;
    // If entered as percentage, e.g. 120 or 80
    if (val > 10) return val / 100;
    return val;
  }
}
