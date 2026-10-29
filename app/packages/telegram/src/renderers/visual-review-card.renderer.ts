import { type RevisionPlan } from '@parisian-shopper/application';

export interface VisualReviewCardDetails {
  readonly productName: string;
  readonly brand: string;
  readonly targetFormat?: string;
  readonly compositorVersion?: string;
  readonly width: number;
  readonly height: number;
  readonly dimensionsPassed: boolean;
  readonly containmentPassed: boolean;
  readonly safetyPassed: boolean;
  readonly casSha256: string;
  readonly stylePresetName?: string;
  readonly templateId?: string;
  readonly version?: number | string;
  readonly reviewStatus?: string;
  readonly layoutIntent?: string;
}

export class VisualReviewCardRenderer {
  public static renderCaption(details: VisualReviewCardDetails): string {
    const templateName = formatTemplateName(details.templateId);
    const formatBadge = details.targetFormat ?? 'Square Post · 1080×1080';
    const dimSuffix =
      details.width !== undefined &&
      details.height !== undefined &&
      !formatBadge.includes(String(details.width))
        ? ` (${details.width}×${details.height})`
        : '';
    const versionBadge = details.version !== undefined ? `V${details.version}` : 'V1';
    const status = details.reviewStatus ?? 'Ready for Review';

    return [
      '🎨 *Visual Creative Review*',
      '',
      `📦 *Product:* ${details.productName} • ${details.brand}`,
      `📐 *Template:* ${templateName}`,
      `🖼️ *Format:* ${formatBadge}${dimSuffix}`,
      `🔢 *Version:* ${versionBadge}`,
      `📋 *Status:* ${status}`,
    ].join('\n');
  }

  public static renderDetails(details: VisualReviewCardDetails): string {
    const formatBadge = details.targetFormat ?? 'Square Post · 1080×1080';
    const compositorBadge = details.compositorVersion ?? 'ps-compositor-v1';
    const dimBadge = details.dimensionsPassed ? 'PASS' : 'FAIL';
    const heroBadge = details.containmentPassed ? 'PASS' : 'FAIL';
    const safetyBadge = details.safetyPassed ? 'PASS' : 'FAIL';
    const shortCas = details.casSha256.slice(0, 8);

    return [
      'ℹ️ *Visual QA & Technical Details*',
      '',
      `📦 *${details.productName}* • ${details.brand}`,
      ...(details.stylePresetName ? [`✨ *Art Direction:* ${details.stylePresetName}`] : []),
      `📐 *Target Format:* ${formatBadge} (${details.width}×${details.height})`,
      `🏷️ *Compositor:* [${compositorBadge}]`,
      '',
      '🛡️ *Validation Badges:*',
      `• Dimensions: [${details.width}×${details.height} ${dimBadge}]`,
      `• Hero Containment: [${heroBadge}]`,
      `• Safety: [${safetyBadge}]`,
      '',
      `🔐 *Storage CAS Fingerprint:* \`#${shortCas}\``,
      ...(details.layoutIntent ? ['', `📐 *Layout Guidance:* ${details.layoutIntent}`] : []),
    ].join('\n');
  }

  public static renderRevisionPlanPreview(params: {
    readonly plan: RevisionPlan;
    readonly productName: string;
    readonly currentVersion: number;
    readonly nextVersion: number;
  }): string {
    const shortJobId = params.plan.creativeJobId.slice(0, 8);
    const targetSummary = params.plan.mutations
      .map((m) => `${m.target}: "${String(m.requestedValue)}"`)
      .join(', ');

    const strategySummary =
      params.plan.executionStrategy === 'AI_BACKGROUND_REGEN'
        ? 'AI Background Generation (~4s, 1 GPU credit)'
        : params.plan.executionStrategy === 'CANVAS_REFORMAT'
          ? 'Canvas Reformat & Re-layout (<200ms)'
          : 'Sharp Targeted Re-layout (<100ms, 0 GPU credits)';

    const heroDigest = params.plan.preservedLayerDigests['PRODUCT_HERO']
      ? `#${params.plan.preservedLayerDigests['PRODUCT_HERO'].slice(0, 8)}`
      : 'Authentic Flacon';

    const bgDigest = params.plan.preservedLayerDigests['BACKGROUND']
      ? `#${params.plan.preservedLayerDigests['BACKGROUND'].slice(0, 8)}`
      : 'Preserved CAS Asset';

    const preservedList: string[] = [];
    if (!params.plan.affectedLayerGroups.includes('PRODUCT_HERO')) {
      preservedList.push(`• Hero Cutout: Authentic Flacon (${heroDigest})`);
    }
    if (!params.plan.affectedLayerGroups.includes('TYPOGRAPHY')) {
      preservedList.push('• Copy & Pricing: Safe & Validated');
    }
    if (!params.plan.affectedLayerGroups.includes('BACKGROUND')) {
      preservedList.push(`• Background: Zero Drift (${bgDigest})`);
    }
    if (preservedList.length === 0) {
      preservedList.push('• Non-targeted layer parameters');
    }

    return [
      `✏️ *Proposed Revision Plan* (Job #${shortJobId} · V${params.currentVersion} ➔ V${params.nextVersion})`,
      '',
      `🎯 *Target:* ${targetSummary}`,
      `✨ *Strategy:* ${strategySummary}`,
      ...(params.plan.confirmationReason
        ? ['', `💡 *Reason:* ${params.plan.confirmationReason}`]
        : []),
      '',
      '🔒 *Preserved Layers (Zero Drift Guaranteed):*',
      ...preservedList,
    ].join('\n');
  }
}

function formatTemplateName(templateId?: string): string {
  if (!templateId) return 'Editorial Split';
  switch (templateId) {
    case 'EDITORIAL_SPLIT':
      return 'Editorial Split';
    case 'CENTERED_HERO':
      return 'Centered Hero';
    case 'SCENT_STORY':
      return 'Scent Story';
    case 'KHMER_SEASONAL':
      return 'Khmer Seasonal';
    default:
      return templateId
        .toLowerCase()
        .split('_')
        .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
        .join(' ');
  }
}
