import { describe, expect, it } from '@jest/globals';
import { resolveStylePreset, REFINED_PRESETS } from './style-presets.js';
import { deriveLayoutIntentForTemplate } from './layout-intent.js';

describe('Refined Art Direction Presets & Prompt Construction', () => {
  const PRESET_KEYS = [
    'PARISIAN_MORNING_ATELIER',
    'NOCTURNE_OBSIDIAN',
    'BOTANICAL_SCENT_STORY',
    'CAMBODIAN_IVORY_CELEBRATION',
    'CLEAN_EDITORIAL_STUDIO',
  ] as const;

  it('defines all 5 refined presets with complete art-direction specifications', () => {
    for (const key of PRESET_KEYS) {
      const preset = REFINED_PRESETS[key];
      expect(preset).toBeDefined();
      expect(preset.id).toBe(key);
      expect(preset.cameraPosition).toBeTruthy();
      expect(preset.focalLengthFeel).toBeTruthy();
      expect(preset.materialPalette.length).toBeGreaterThanOrEqual(3);
      expect(preset.lightSource).toBeTruthy();
      expect(preset.productGroundingSurface).toBeTruthy();
      expect(['LOW', 'MEDIUM', 'SPARSE']).toContain(preset.foregroundDensity);
      expect(['DEEP_BOKEH', 'SHALLOW_BLUR', 'STUDIO_FALLOFF']).toContain(preset.backgroundDepth);
      expect(preset.negativeSpaceLocation).toBeTruthy();
      expect(preset.prohibitedCliches.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('CRUCIAL: strictly omits specific product names from briefPrompt to prevent AI bottle/text generation', () => {
    const sensitiveProductName = 'Yes I Am The King Eau de Parfum';

    for (const key of PRESET_KEYS) {
      const preset = REFINED_PRESETS[key];
      const prompt = preset.briefPrompt(sensitiveProductName);

      expect(prompt).not.toContain(sensitiveProductName);
      expect(prompt).not.toContain('Yes I Am The King');
      expect(prompt).not.toContain('Eau de Parfum');
      // Must use category-generic framing instead
      expect(prompt.toLowerCase()).toContain('fragrance');
      expect(prompt.toLowerCase()).toContain('perfume bottle placement');
    }
  });

  it('builds layout-aware prompt when LayoutIntent is supplied', () => {
    const preset = resolveStylePreset('PARISIAN_MORNING_ATELIER');
    const layoutIntent = deriveLayoutIntentForTemplate('EDITORIAL_SPLIT', 1080, 1080);

    const prompt = preset.buildPrompt({ layoutIntent });
    expect(prompt).toContain('Spatial layout:');
    expect(prompt).toContain('left half features a distinct architectural pedestal');
    expect(prompt).toContain('right half must remain deeply out-of-focus');
    expect(prompt).toContain('Primary illumination from upper left');
    expect(prompt).toContain('Surface baseline at 74% height');
    expect(prompt).toContain('Strictly avoid rendering any visual markers, lines, or guide boxes');
    expect(prompt).not.toContain('Yes I Am The King');
  });

  it('resolves legacy style preset aliases cleanly for full backward compatibility', () => {
    // ATELIER_HAUSSMANN -> PARISIAN_MORNING_ATELIER
    const haussmann = resolveStylePreset('ATELIER_HAUSSMANN', 'fragrance');
    expect(haussmann.name).toBe('Parisian Morning Atelier');
    expect(['ATELIER_HAUSSMANN', 'PARISIAN_MORNING_ATELIER']).toContain(haussmann.id);

    // NOCTURNE_ROYALE -> NOCTURNE_OBSIDIAN
    const nocturne = resolveStylePreset('NOCTURNE_ROYALE', 'fragrance');
    expect(nocturne.name).toBe('Nocturne Obsidian');
    expect(['NOCTURNE_ROYALE', 'NOCTURNE_OBSIDIAN']).toContain(nocturne.id);

    // SCENT_PYRAMID -> BOTANICAL_SCENT_STORY
    const pyramid = resolveStylePreset('SCENT_PYRAMID', 'fragrance');
    expect(pyramid.name).toBe('Botanical Scent Story');
    expect(['SCENT_PYRAMID', 'BOTANICAL_SCENT_STORY']).toContain(pyramid.id);

    // CLASSIC_STUDIO -> CLEAN_EDITORIAL_STUDIO
    const studio = resolveStylePreset('CLASSIC_STUDIO', 'fragrance');
    expect(studio.name).toBe('Clean Editorial Studio');
    expect(['CLASSIC_STUDIO', 'CLEAN_EDITORIAL_STUDIO']).toContain(studio.id);

    // CAMBODIAN_IVORY -> CAMBODIAN_IVORY_CELEBRATION
    const khmer = resolveStylePreset('CAMBODIAN_IVORY', 'fragrance');
    expect(khmer.name).toBe('Cambodian Ivory Celebration');
    expect(khmer.id).toBe('CAMBODIAN_IVORY_CELEBRATION');
  });

  it('maintains strict negative prompts prohibiting products, bottles, typography, and humans', () => {
    for (const key of PRESET_KEYS) {
      const preset = REFINED_PRESETS[key];
      const negative = preset.negativePrompt.toLowerCase();

      expect(negative).toContain('no products');
      expect(negative).toContain('no perfume bottles');
      expect(negative).toContain('no text');
      expect(negative).toContain('no typography');
      expect(negative).toContain('no humans');
      expect(negative).toContain('no logos');
      expect(negative).toContain('no watermarks');
    }
  });
});
