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
}

export class VisualReviewCardRenderer {
  public static renderCaption(details: VisualReviewCardDetails): string {
    const formatBadge = details.targetFormat ?? '1:1 Feed Post';
    const compositorBadge = details.compositorVersion ?? 'ps-compositor-v1';
    const dimBadge = details.dimensionsPassed ? 'PASS' : 'FAIL';
    const heroBadge = details.containmentPassed ? 'PASS' : 'FAIL';
    const safetyBadge = details.safetyPassed ? 'PASS' : 'FAIL';
    const shortCas = details.casSha256.slice(0, 8);

    return [
      '🎨 *Visual Creative Review*',
      '',
      `📦 *${details.productName}* • ${details.brand}`,
      `📐 *Target Format:* ${formatBadge} (${details.width}x${details.height})`,
      `🏷 *Compositor:* [${compositorBadge}]`,
      '',
      '🛡 *Validation Badges:*',
      `• Dimensions: [${details.width}x${details.height} ${dimBadge}]`,
      `• Hero Containment: [${heroBadge}]`,
      `• Safety: [${safetyBadge}]`,
      '',
      `🔐 *Storage CAS Fingerprint:* \`#${shortCas}\``,
    ].join('\n');
  }
}
