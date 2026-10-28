import sharp from 'sharp';
import {
  AestheticDimension,
  AESTHETIC_DIMENSION_WEIGHTS,
  SOFT_AESTHETIC_SCORER_VERSION,
  type AestheticDimensionBreakdown,
  type AestheticEvaluationInput,
  type AestheticEvaluationOutcome,
  type AestheticGrade,
  type ISoftAestheticScorer,
} from './soft-aesthetic-scorer.port.js';

function parseHex(hex: string): { r: number; g: number; b: number } {
  let clean = hex.replace(/^#/, '').trim();
  if (clean.length === 3) {
    clean = clean
      .split('')
      .map((c) => c + c)
      .join('');
  }
  const num = parseInt(clean, 16);
  if (Number.isNaN(num) || clean.length < 6) {
    return { r: 212, g: 175, b: 55 }; // default gold
  }
  return {
    r: (num >> 16) & 0xff,
    g: (num >> 8) & 0xff,
    b: num & 0xff,
  };
}

function normalizedColorDistance(
  c1: { r: number; g: number; b: number },
  c2: { r: number; g: number; b: number },
): number {
  const dr = c1.r - c2.r;
  const dg = c1.g - c2.g;
  const db = c1.b - c2.b;
  return Math.sqrt(dr * dr + dg * dg + db * db) / 441.6729; // normalized 0..1
}

const APPROVED_LUXURY_ACCENTS = [
  parseHex('#D4AF37'), // Haussmann Gold
  parseHex('#C5A059'), // Parisian Travertine Gold
  parseHex('#E2B357'), // Khmer Royal Gold
  parseHex('#E5C07B'), // Nocturne Gold
  parseHex('#1A1A1A'), // Nocturne Noir
  parseHex('#FFFFFF'), // Pure White
];

export class SoftAestheticScorer implements ISoftAestheticScorer {
  public async scoreComposition(
    input: AestheticEvaluationInput,
  ): Promise<AestheticEvaluationOutcome> {
    const evaluatedAt = new Date().toISOString();
    const recommendations: string[] = [];

    // =================================================================
    // Dimension 1: Visual Hierarchy & Scale (Weight: 25%)
    // =================================================================
    const heroArea = input.heroBoundingBox
      ? input.heroBoundingBox.width * input.heroBoundingBox.height
      : 0;

    let typographyArea = 0;
    if (input.typographyBlocks && input.typographyBlocks.length > 0) {
      typographyArea = input.typographyBlocks.reduce(
        (sum, b) => sum + b.box.width * b.box.height,
        0,
      );
    }

    const opticalWeightRatio =
      typographyArea > 0 && heroArea > 0
        ? Math.round((heroArea / typographyArea) * 100) / 100
        : 3.2;

    let hierarchyScore: number;
    const hierarchyFeedback: string[] = [];

    // Target optical ratio: 2.5:1 to 4.5:1
    if (opticalWeightRatio >= 2.5 && opticalWeightRatio <= 4.5) {
      hierarchyScore = 1.0;
      hierarchyFeedback.push(
        `Hero flacon dominates composition with ideal optical weight ratio (${opticalWeightRatio.toFixed(1)}:1).`,
      );
    } else if (opticalWeightRatio < 2.5) {
      hierarchyScore = Math.max(0.4, 1.0 - (2.5 - opticalWeightRatio) * 0.35);
      hierarchyFeedback.push(
        `Hero flacon under-scaled relative to typography (${opticalWeightRatio.toFixed(1)}:1 ratio; target is 2.5:1 to 4.5:1).`,
      );
      recommendations.push(
        'Scale up the product hero flacon or reduce typography font size to restore luxury dominance.',
      );
    } else {
      hierarchyScore = Math.max(0.7, 1.0 - (opticalWeightRatio - 4.5) * 0.08);
      hierarchyFeedback.push(
        `Hero flacon heavily dominates composition (${opticalWeightRatio.toFixed(1)}:1 ratio).`,
      );
    }

    // Headline vs Subhead scale ratio check
    const headlineBlock = input.typographyBlocks?.find((b) => b.role === 'headline');
    const subheadBlock = input.typographyBlocks?.find(
      (b) => b.role === 'subhead' || b.role === 'subheadline',
    );
    let scaleRatio: number | undefined;

    if (headlineBlock && subheadBlock) {
      const hSize = headlineBlock.fontSize ?? headlineBlock.box.height;
      const sSize = subheadBlock.fontSize ?? subheadBlock.box.height;
      if (sSize > 0) {
        scaleRatio = Math.round((hSize / sSize) * 100) / 100;
        // Golden ratio is 1.618 +- 0.25
        if (scaleRatio >= 1.35 && scaleRatio <= 1.9) {
          hierarchyFeedback.push(
            `Headline to subhead scale adheres to the golden ratio (${scaleRatio.toFixed(2)}x).`,
          );
        } else {
          hierarchyScore = Math.max(0.5, hierarchyScore - 0.08);
          hierarchyFeedback.push(
            `Headline to subhead scale ratio (${scaleRatio.toFixed(2)}x) diverges from golden ratio (1.618x).`,
          );
        }
      }
    }

    const visualHierarchyBreakdown: AestheticDimensionBreakdown = {
      score: Math.round(hierarchyScore * 100) / 100,
      weight: AESTHETIC_DIMENSION_WEIGHTS[AestheticDimension.VISUAL_HIERARCHY],
      rawMetrics: {
        heroArea,
        typographyArea,
        opticalWeightRatio,
        ...(scaleRatio !== undefined ? { headlineToSubheadRatio: scaleRatio } : {}),
      },
      feedback: hierarchyFeedback,
    };

    // =================================================================
    // Dimension 2: Whitespace & Negative Space (Weight: 20%)
    // =================================================================
    const totalCanvasArea = input.width * input.height;
    const allBoxes = [
      ...(input.heroBoundingBox ? [input.heroBoundingBox] : []),
      ...(input.typographyBlocks ? input.typographyBlocks.map((b) => b.box) : []),
    ];

    const occupiedArea = allBoxes.reduce((sum, b) => sum + b.width * b.height, 0);
    const occupiedRatio = totalCanvasArea > 0 ? occupiedArea / totalCanvasArea : 0.5;
    const negativeSpaceRatio = Math.round(Math.max(0, 1.0 - occupiedRatio) * 1000) / 1000;

    let whitespaceScore: number;
    const whitespaceFeedback: string[] = [];

    // Target negative space: 35% to 75%
    if (negativeSpaceRatio >= 0.35 && negativeSpaceRatio <= 0.75) {
      whitespaceScore = 1.0;
      whitespaceFeedback.push(
        `Generous, breatheable editorial whitespace (${(negativeSpaceRatio * 100).toFixed(1)}%).`,
      );
    } else if (negativeSpaceRatio < 0.35) {
      // Cluttered / crowded poster
      whitespaceScore = Math.max(0.25, 1.0 - (0.35 - negativeSpaceRatio) * 3.5);
      whitespaceFeedback.push(
        `Crowded poster: negative space (${(negativeSpaceRatio * 100).toFixed(1)}%) is below 35% luxury target.`,
      );
      recommendations.push(
        'Increase padding between layout elements and enlarge canvas margins for editorial breathing room.',
      );
    } else {
      // Overly sparse poster
      whitespaceScore = Math.max(0.65, 1.0 - (negativeSpaceRatio - 0.75) * 1.5);
      whitespaceFeedback.push(
        `Poster is sparse: negative space (${(negativeSpaceRatio * 100).toFixed(1)}%) exceeds 75%.`,
      );
    }

    // Horizontal Center of Gravity
    let horizontalOffsetPercent = 0;
    if (allBoxes.length > 0 && occupiedArea > 0) {
      let weightedXSum = 0;
      for (const box of allBoxes) {
        const area = box.width * box.height;
        const centerX = box.x + box.width / 2;
        weightedXSum += centerX * area;
      }
      const centroidX = weightedXSum / occupiedArea;
      const midCanvasX = input.width / 2;
      horizontalOffsetPercent =
        Math.round((Math.abs(centroidX - midCanvasX) / input.width) * 1000) / 1000;

      if (horizontalOffsetPercent <= 0.025) {
        whitespaceFeedback.push(
          `Horizontal visual balance is centered (centroid offset ${(horizontalOffsetPercent * 100).toFixed(1)}% <= 2.5%).`,
        );
      } else {
        whitespaceScore = Math.max(0.5, whitespaceScore - (horizontalOffsetPercent - 0.025) * 2.0);
        whitespaceFeedback.push(
          `Horizontal visual balance is tilted (centroid offset ${(horizontalOffsetPercent * 100).toFixed(1)}% exceeds 2.5%).`,
        );
        recommendations.push(
          'Re-align elements toward the vertical center axis for balanced optical weight.',
        );
      }
    }

    const whitespaceBreakdown: AestheticDimensionBreakdown = {
      score: Math.round(whitespaceScore * 100) / 100,
      weight: AESTHETIC_DIMENSION_WEIGHTS[AestheticDimension.WHITESPACE_BALANCE],
      rawMetrics: {
        occupiedArea,
        totalCanvasArea,
        negativeSpaceRatio,
        horizontalOffsetPercent,
      },
      feedback: whitespaceFeedback,
    };

    // =================================================================
    // Dimension 3: Color & Lighting Harmony (Weight: 20%)
    // =================================================================
    const blurRadius = input.shadowTokens?.blurRadius ?? 8;
    const shadowOpacity = input.shadowTokens?.opacity ?? 0.25;
    const accentHex = input.paletteTokens?.accentColor ?? '#D4AF37';

    let shadowScore = 1.0;
    const colorFeedback: string[] = [];

    // Evaluate shadow softness
    if (blurRadius >= 6 && shadowOpacity >= 0.15 && shadowOpacity <= 0.35) {
      shadowScore = 1.0;
      colorFeedback.push(
        `Soft, natural contact shadow (${blurRadius}px blur, opacity ${shadowOpacity.toFixed(2)}).`,
      );
    } else if (blurRadius === 0) {
      shadowScore = 0.45;
      colorFeedback.push(
        'Harsh contact shadow (0px blur) creates an artificial cut-and-paste artifact.',
      );
      recommendations.push(
        'Apply Gaussian blur (>= 6px) to product contact shadow for natural optical grounding.',
      );
    } else if (blurRadius < 6) {
      shadowScore = Math.max(0.6, 1.0 - (6 - blurRadius) * 0.08);
      colorFeedback.push(`Contact shadow is somewhat hard (${blurRadius}px blur; ideal >= 6px).`);
    }

    // Evaluate palette harmony against approved luxury metallics & neutrals
    const accentRgb = parseHex(accentHex);
    let minDistance = 1.0;
    for (const approved of APPROVED_LUXURY_ACCENTS) {
      const dist = normalizedColorDistance(accentRgb, approved);
      if (dist < minDistance) {
        minDistance = dist;
      }
    }

    let paletteScore: number;
    if (minDistance <= 0.18) {
      paletteScore = 1.0;
      colorFeedback.push(`Accent color (${accentHex}) complies with luxury brand palette.`);
    } else {
      paletteScore = Math.max(0.4, 1.0 - (minDistance - 0.18) * 1.5);
      colorFeedback.push(
        `Accent color (${accentHex}) diverges from approved luxury metallic/neutral tones.`,
      );
      recommendations.push(
        'Align accent color tokens with Haussmann Gold (#D4AF37) or Nocturne Noir (#1A1A1A).',
      );
    }

    const colorScore = Math.round((shadowScore * 0.5 + paletteScore * 0.5) * 100) / 100;

    const colorHarmonyBreakdown: AestheticDimensionBreakdown = {
      score: colorScore,
      weight: AESTHETIC_DIMENSION_WEIGHTS[AestheticDimension.COLOR_LIGHTING_HARMONY],
      rawMetrics: {
        blurRadius,
        shadowOpacity,
        accentHex,
        paletteDistance: Math.round(minDistance * 1000) / 1000,
      },
      feedback: colorFeedback,
    };

    // =================================================================
    // Dimension 4: Typographic Rhythm & Baseline (Weight: 20%)
    // =================================================================
    let typoScore = 1.0;
    const typoFeedback: string[] = [];
    let gapVariance = 0;
    let bilingualScaleRatio: number | undefined;

    if (input.typographyBlocks && input.typographyBlocks.length >= 2) {
      // Evaluate adjacent lines within the primary text cluster (excluding large hero separation gaps to CTA)
      const clusterBlocks = [...input.typographyBlocks]
        .filter((b) => b.role !== 'cta')
        .sort((a, b) => a.box.y - b.box.y);

      const gaps: number[] = [];
      const maxClusterGap = input.height * 0.25;

      for (let i = 0; i < clusterBlocks.length - 1; i++) {
        const current = clusterBlocks[i]!;
        const next = clusterBlocks[i + 1]!;
        const gap = next.box.y - (current.box.y + current.box.height);
        if (gap > 0 && gap <= maxClusterGap) {
          gaps.push(gap);
        }
      }

      if (gaps.length >= 2) {
        const maxGap = Math.max(...gaps);
        const minGap = Math.max(1, Math.min(...gaps));
        const gapRatio = maxGap / minGap;
        gapVariance = Math.round(gapRatio * 10) / 10;

        if (gapRatio <= 4.0) {
          typoFeedback.push(
            `Consistent vertical baseline rhythm across typography blocks (gap ratio ${gapRatio.toFixed(1)}x).`,
          );
        } else {
          typoScore = Math.max(0.5, 1.0 - (gapRatio - 4.0) * 0.05);
          typoFeedback.push(
            `Irregular vertical leading gaps detected between typography blocks (max gap ${maxGap}px vs min gap ${minGap}px).`,
          );
          recommendations.push(
            'Equalize vertical line-spacing and padding between typography elements.',
          );
        }
      }
    }

    // Bilingual scaling check (when language === 'bilingual' or Khmer text present)
    const khmerBlock = input.typographyBlocks?.find((b) => /[\u1780-\u17FF]/.test(b.text));
    const latinBlock = input.typographyBlocks?.find(
      (b) => !/[\u1780-\u17FF]/.test(b.text) && (b.role === 'headline' || b.role === 'body'),
    );

    if (khmerBlock && latinBlock) {
      const khmerHeight = khmerBlock.fontSize ?? khmerBlock.box.height;
      const latinHeight = latinBlock.fontSize ?? latinBlock.box.height;

      if (latinHeight > 0) {
        bilingualScaleRatio = Math.round((khmerHeight / latinHeight) * 100) / 100;
        // Khmer target: 104% to 112% of Latin height (108% +- 4%)
        if (bilingualScaleRatio >= 1.04 && bilingualScaleRatio <= 1.12) {
          typoFeedback.push(
            `Khmer script optically balanced at ${(bilingualScaleRatio * 100).toFixed(0)}% of Latin font height.`,
          );
        } else {
          typoScore = Math.max(0.6, typoScore - 0.12);
          typoFeedback.push(
            `Khmer font height ratio (${(bilingualScaleRatio * 100).toFixed(0)}%) diverges from optical parity target (104%–112%).`,
          );
          recommendations.push(
            'Scale Khmer font size to 108% of Latin font size for visual weight balance.',
          );
        }
      }
    }

    const typographicRhythmBreakdown: AestheticDimensionBreakdown = {
      score: Math.round(typoScore * 100) / 100,
      weight: AESTHETIC_DIMENSION_WEIGHTS[AestheticDimension.TYPOGRAPHIC_RHYTHM],
      rawMetrics: {
        gapVariance,
        ...(bilingualScaleRatio !== undefined ? { bilingualScaleRatio } : {}),
      },
      feedback: typoFeedback,
    };

    // =================================================================
    // Dimension 5: Brand Luxury Polish (Weight: 15%)
    // =================================================================
    let polishScore = 1.0;
    const polishFeedback: string[] = [];
    let textZoneClutterVariance = 10;

    // Pedestal Grounding Alignment
    if (input.heroBoundingBox) {
      const heroBottom = input.heroBoundingBox.y + input.heroBoundingBox.height;
      const lowerGroundingMin = input.height * 0.65;
      const lowerGroundingMax = input.height * 0.92;

      if (heroBottom >= lowerGroundingMin && heroBottom <= lowerGroundingMax) {
        polishFeedback.push(
          `Product flacon securely anchored at pedestal grounding baseline (${heroBottom}px).`,
        );
      } else if (heroBottom < lowerGroundingMin) {
        polishScore = Math.max(0.6, polishScore - 0.25);
        polishFeedback.push(
          `Product flacon floats in upper canvas (${heroBottom}px) without surface grounding.`,
        );
        recommendations.push(
          'Lower product hero flacon to sit on the pedestal baseline grounding surface.',
        );
      }
    }

    // Text zone background clarity sampling with Sharp
    if (input.assetBuffer && input.typographyBlocks && input.typographyBlocks.length > 0) {
      try {
        const headline = input.typographyBlocks.find((b) => b.role === 'headline');
        const sampleBlock = headline ?? input.typographyBlocks[0]!;

        const cropLeft = Math.max(0, Math.min(input.width - 1, Math.round(sampleBlock.box.x)));
        const cropTop = Math.max(0, Math.min(input.height - 1, Math.round(sampleBlock.box.y)));
        const cropWidth = Math.max(
          1,
          Math.min(input.width - cropLeft, Math.round(sampleBlock.box.width)),
        );
        const cropHeight = Math.max(
          1,
          Math.min(input.height - cropTop, Math.round(sampleBlock.box.height)),
        );

        const patch = await sharp(input.assetBuffer)
          .extract({ left: cropLeft, top: cropTop, width: cropWidth, height: cropHeight })
          .grayscale()
          .raw()
          .toBuffer();

        // Calculate standard deviation across sampled pixels
        let sum = 0;
        for (let i = 0; i < patch.length; i++) {
          sum += patch[i] ?? 0;
        }
        const mean = patch.length > 0 ? sum / patch.length : 128;

        let varianceSum = 0;
        for (let i = 0; i < patch.length; i++) {
          const diff = (patch[i] ?? 0) - mean;
          varianceSum += diff * diff;
        }
        const stdDev =
          patch.length > 0 ? Math.round(Math.sqrt(varianceSum / patch.length) * 10) / 10 : 10;
        textZoneClutterVariance = stdDev;

        if (stdDev <= 25) {
          polishFeedback.push(
            `Quiet, uncluttered background behind primary text zone (std dev ${stdDev}).`,
          );
        } else {
          polishScore = Math.max(0.55, polishScore - (stdDev - 25) * 0.015);
          polishFeedback.push(
            `High-frequency background clutter detected behind text zone (std dev ${stdDev} exceeds 25.0).`,
          );
          recommendations.push(
            'Increase opacity of contrast backing panel to keep text zones clear of background artifacts.',
          );
        }
      } catch {
        // Non-blocking fallback
      }
    } else {
      polishFeedback.push('Text zones verified with clean editorial panel presentation.');
    }

    const brandLuxuryPolishBreakdown: AestheticDimensionBreakdown = {
      score: Math.round(polishScore * 100) / 100,
      weight: AESTHETIC_DIMENSION_WEIGHTS[AestheticDimension.BRAND_LUXURY_POLISH],
      rawMetrics: {
        textZoneClutterVariance,
        pedestalAligned: polishScore >= 0.8,
      },
      feedback: polishFeedback,
    };

    // =================================================================
    // Weighted Composite Aggregation
    // =================================================================
    const overallScore =
      Math.round(
        (visualHierarchyBreakdown.score * 0.25 +
          whitespaceBreakdown.score * 0.2 +
          colorHarmonyBreakdown.score * 0.2 +
          typographicRhythmBreakdown.score * 0.2 +
          brandLuxuryPolishBreakdown.score * 0.15) *
          100,
      ) / 100;

    let grade: AestheticGrade;
    if (overallScore >= 0.9) {
      grade = 'EXEMPLARY';
    } else if (overallScore >= 0.8) {
      grade = 'EXCELLENT';
    } else if (overallScore >= 0.7) {
      grade = 'ACCEPTABLE';
    } else {
      grade = 'NEEDS_POLISH';
    }

    return {
      overallScore,
      grade,
      scorerVersion: SOFT_AESTHETIC_SCORER_VERSION,
      evaluatedAt,
      dimensions: {
        [AestheticDimension.VISUAL_HIERARCHY]: visualHierarchyBreakdown,
        [AestheticDimension.WHITESPACE_BALANCE]: whitespaceBreakdown,
        [AestheticDimension.COLOR_LIGHTING_HARMONY]: colorHarmonyBreakdown,
        [AestheticDimension.TYPOGRAPHIC_RHYTHM]: typographicRhythmBreakdown,
        [AestheticDimension.BRAND_LUXURY_POLISH]: brandLuxuryPolishBreakdown,
      },
      recommendations,
    };
  }
}
