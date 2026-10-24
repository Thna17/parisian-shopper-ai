import { type LayoutIntent } from './layout-intent.js';

export interface StylePresetDefinition {
  readonly id: string;
  readonly name: string;
  readonly buttonText: string;
  readonly description: string;
  // Professional art direction attributes
  readonly cameraPosition: string;
  readonly focalLengthFeel: string;
  readonly materialPalette: readonly string[];
  readonly lightSource: string;
  readonly productGroundingSurface: string;
  readonly foregroundDensity: 'LOW' | 'MEDIUM' | 'SPARSE';
  readonly backgroundDepth: 'DEEP_BOKEH' | 'SHALLOW_BLUR' | 'STUDIO_FALLOFF';
  readonly negativeSpaceLocation: string;
  readonly prohibitedCliches: readonly string[];
  // Clean category-generic prompt builders (NEVER interpolates product name)
  readonly buildPrompt: (options?: { layoutIntent?: LayoutIntent; category?: string }) => string;
  readonly briefPrompt: (productNameOrCategory?: string) => string;
  readonly negativePrompt: string;
}

export const DEFAULT_BACKGROUND_NEGATIVE_PROMPT =
  'No products, no perfume bottles, no bottles, no caps, no spray nozzles, no cosmetics, no packaging, no boxes, no merchandise, no people, no humans, no limbs, no hands, no faces, no text, no letters, no words, no numbers, no labels, no typography, no logos, no branding, no watermarks, no UI, no floating items, no steep angle, no oversaturated colors, no plastic textures, no 3D render look, no cartoon.';

// 1. PARISIAN MORNING ATELIER
export const PARISIAN_MORNING_ATELIER: StylePresetDefinition = {
  id: 'PARISIAN_MORNING_ATELIER',
  name: 'Parisian Morning Atelier',
  buttonText: '🏛 Atelier Haussmann',
  description:
    'Ivory French travertine limestone, Parisian morning window sunlight, botanical lavender/olive shadows, boiserie bokeh.',
  cameraPosition: 'Straight-on eye-level perspective, parallel to architectural horizon.',
  focalLengthFeel:
    '85mm f/2.0 portrait prime lens, soft diffused highlights, creamy depth falloff.',
  materialPalette: [
    'Rough-hewn ivory French travertine limestone',
    'Warm greige boiserie wall paneling',
    'Natural porous mineral textures',
    'Chiseled organic limestone edges',
  ],
  lightSource:
    'Warm golden-hour morning sunlight streaming through tall Parisian balcony windows from the left, casting soft, elegant botanical shadows.',
  productGroundingSurface:
    'Monolithic, low rectangular block of rough-hewn ivory French travertine limestone with natural porous textures.',
  foregroundDensity: 'SPARSE',
  backgroundDepth: 'DEEP_BOKEH',
  negativeSpaceLocation:
    'Generous flat negative space on the limestone slab for subsequent product placement; quiet uncluttered negative space in upper background.',
  prohibitedCliches: [
    'Floating perfume bottles',
    'Artificial plastic flower petals',
    'Oversaturated yellow glows',
    'Distorted wide-angle lens perspective',
  ],
  buildPrompt: (options?: { layoutIntent?: LayoutIntent; category?: string }): string => {
    const layout = options?.layoutIntent;
    const base = `Commercial luxury fragrance still-life photography for perfume bottle placement. A monolithic, low rectangular block of rough-hewn ivory French travertine limestone with natural porous textures and chiseled organic edges. Warm golden-hour morning sunlight streaming through classic tall Parisian balcony windows from the left, casting soft, elegant botanical shadows (wild lavender stems and olive branches) across the stone and floor. The background is an out-of-focus, warm greige and cream Haussmannian interior with soft boiserie wall paneling in creamy bokeh. Shot on 85mm f/2.0 portrait prime lens, soft diffused highlights, photorealistic textures, zero distortion. Generous flat negative space on top of the limestone slab for product placement. Straight-on camera perspective.`;
    if (!layout) return base;
    return `${base} Spatial layout: ${layout.promptGuidance} Primary illumination from ${layout.lightingDirection.toLowerCase().replace(/_/g, ' ')}. Surface baseline at ${Math.round(layout.horizonOrPedestalPosition * 100)}% height. Reserved copy space: ${layout.reservedNegativeSpace.guidance} Strictly avoid rendering any visual markers, lines, or guide boxes.`;
  },
  briefPrompt: (_productNameOrCategory?: string): string => {
    return `Commercial luxury fragrance still-life photography for perfume bottle placement. A monolithic, low rectangular block of rough-hewn ivory French travertine limestone with natural porous textures and chiseled organic edges. Warm golden-hour morning sunlight streaming through classic tall Parisian balcony windows from the left, casting soft, elegant botanical shadows (wild lavender stems and olive branches) across the stone and floor. The background is an out-of-focus, warm greige and cream Haussmannian interior with soft boiserie wall paneling in creamy bokeh. Shot on 85mm f/2.0 portrait prime lens, soft diffused highlights, photorealistic textures, zero distortion. Generous flat negative space on top of the limestone slab for product placement. Straight-on camera perspective.`;
  },
  negativePrompt: DEFAULT_BACKGROUND_NEGATIVE_PROMPT,
};

// 2. NOCTURNE OBSIDIAN
export const NOCTURNE_OBSIDIAN: StylePresetDefinition = {
  id: 'NOCTURNE_OBSIDIAN',
  name: 'Nocturne Obsidian',
  buttonText: '👑 Nocturne Royale',
  description:
    'Matte volcanic slate, polished black obsidian reflection, warm golden-amber backlight, and ethereal aromatic mist.',
  cameraPosition: 'Straight-on eye-level commercial studio angle, perfectly level horizon.',
  focalLengthFeel: '90mm f/2.8 commercial macro lens, shallow depth of field, silky smooth bokeh.',
  materialPalette: [
    'Raw matte black volcanic slate',
    'Polished black obsidian mirror-finish slab',
    'Atmospheric aromatic mist and gentle smoke',
  ],
  lightSource:
    'Dramatic chiaroscuro studio lighting: powerful warm golden-amber backlight glowing softly from behind center, subtle cool silver side rim light.',
  productGroundingSurface:
    'Low, wide, seamless pedestal made of raw matte black volcanic slate and polished black obsidian with a mirror-finish top reflection.',
  foregroundDensity: 'LOW',
  backgroundDepth: 'STUDIO_FALLOFF',
  negativeSpaceLocation:
    'Clean, uncluttered, generous empty flat space centered on the obsidian surface reserved for hero bottle placement.',
  prohibitedCliches: [
    'Exploding neon sparks',
    'Laser beams',
    'Floating synthetic shards',
    'Cartoon lightning',
  ],
  buildPrompt: (options?: { layoutIntent?: LayoutIntent; category?: string }): string => {
    const layout = options?.layoutIntent;
    const base = `Commercial luxury fragrance still-life photography for perfume bottle placement. A low, wide, seamless pedestal made of raw matte black volcanic slate and polished black obsidian with a mirror-finish top reflection. Dramatic chiaroscuro studio lighting: a powerful, warm golden-amber backlight glowing softly from behind the center, casting rim-light edge reflections. Subtle cool silver side rim light. A delicate, ethereal wisp of aromatic smoke and gentle mist curling low across the stone base. Macro commercial photography, 90mm f/2.8 lens, shallow depth of field, silky smooth bokeh in background. Clean, uncluttered, generous empty flat space centered on the obsidian surface reserved for hero bottle placement. Straight-on eye-level camera angle, perfectly level horizon.`;
    if (!layout) return base;
    return `${base} Spatial layout: ${layout.promptGuidance} Lighting direction: ${layout.lightingDirection.toLowerCase().replace(/_/g, ' ')}. Pedestal horizon at ${Math.round(layout.horizonOrPedestalPosition * 100)}% height. Reserved copy space: ${layout.reservedNegativeSpace.guidance} Strictly avoid rendering any visual markers, lines, or guide boxes.`;
  },
  briefPrompt: (_productNameOrCategory?: string): string => {
    return `Commercial luxury fragrance still-life photography for perfume bottle placement. A low, wide, seamless pedestal made of raw matte black volcanic slate and polished black obsidian with a mirror-finish top reflection. Dramatic chiaroscuro studio lighting: a powerful, warm golden-amber backlight glowing softly from behind the center, casting rim-light edge reflections. Subtle cool silver side rim light. A delicate, ethereal wisp of aromatic smoke and gentle mist curling low across the stone base. Macro commercial photography, 90mm f/2.8 lens, shallow depth of field, silky smooth bokeh in background. Clean, uncluttered, generous empty flat space centered on the obsidian surface reserved for hero bottle placement. Straight-on eye-level camera angle, perfectly level horizon.`;
  },
  negativePrompt: DEFAULT_BACKGROUND_NEGATIVE_PROMPT,
};

// 3. BOTANICAL SCENT STORY
export const BOTANICAL_SCENT_STORY: StylePresetDefinition = {
  id: 'BOTANICAL_SCENT_STORY',
  name: 'Botanical Scent Story',
  buttonText: '🌿 Scent Story',
  description:
    'Dark graphite mineral slab, glistening Italian bergamot slice, French lavender, raw ambergris resin, smoky vetiver roots on dark walnut.',
  cameraPosition: 'Slight three-quarters studio perspective, straight horizontal baseline.',
  focalLengthFeel:
    '100mm macro prime lens, f/4 aperture, pin-sharp foreground with gentle background falloff.',
  materialPalette: [
    'Dark graphite mineral stone slab',
    'Polished dark walnut wood surface',
    'Fresh glistening Italian bergamot slice with citrus oil droplets',
    'Fresh sprigs of French lavender',
    'Glowing raw ambergris resin chunk',
    'Smoky Haitian vetiver roots',
  ],
  lightSource:
    'Cinematic studio lighting with subtle rim lights, soft fog in background, highlighting organic textures.',
  productGroundingSurface:
    'Dark graphite mineral stone slab resting on a polished dark walnut surface with soft reflections.',
  foregroundDensity: 'MEDIUM',
  backgroundDepth: 'STUDIO_FALLOFF',
  negativeSpaceLocation:
    'Fragrance elements artfully arranged around the base perimeter only; center and upper area completely clean and empty.',
  prohibitedCliches: [
    'Artificial plastic fruits',
    'Floating water splashes',
    'Distorted fruit cross-sections',
    'Digital noise',
  ],
  buildPrompt: (options?: { layoutIntent?: LayoutIntent; category?: string }): string => {
    const layout = options?.layoutIntent;
    const base = `Commercial fragrance still-life advertisement set for perfume bottle placement. A dark graphite mineral stone slab resting on a polished dark walnut surface with soft reflections. Artfully arranged around the base perimeter are natural fragrance elements in sharp, crisp detail: a slice of glistening Italian bergamot with fine citrus oil droplets, a few fresh sprigs of French lavender, a chunk of glowing raw ambergris resin, and smoky vetiver roots. The center of the mineral slab is completely clean, flat, and empty for the hero bottle. Cinematic studio lighting with subtle rim lights, soft fog in the background, 100mm macro lens, f/4 aperture, pin-sharp foreground elements with gentle background falloff.`;
    if (!layout) return base;
    return `${base} Spatial layout: ${layout.promptGuidance} Illumination direction: ${layout.lightingDirection.toLowerCase().replace(/_/g, ' ')}. Surface baseline at ${Math.round(layout.horizonOrPedestalPosition * 100)}% height. Reserved copy space: ${layout.reservedNegativeSpace.guidance} Strictly avoid rendering any visual markers, lines, or guide boxes.`;
  },
  briefPrompt: (_productNameOrCategory?: string): string => {
    return `Commercial fragrance still-life advertisement set for perfume bottle placement. A dark graphite mineral stone slab resting on a polished dark walnut surface with soft reflections. Artfully arranged around the base perimeter are natural fragrance elements in sharp, crisp detail: a slice of glistening Italian bergamot with fine citrus oil droplets, a few fresh sprigs of French lavender, a chunk of glowing raw ambergris resin, and smoky vetiver roots. The center of the mineral slab is completely clean, flat, and empty for the hero bottle. Cinematic studio lighting with subtle rim lights, soft fog in the background, 100mm macro lens, f/4 aperture, pin-sharp foreground elements with gentle background falloff.`;
  },
  negativePrompt: DEFAULT_BACKGROUND_NEGATIVE_PROMPT,
};

// 4. CAMBODIAN IVORY CELEBRATION
export const CAMBODIAN_IVORY_CELEBRATION: StylePresetDefinition = {
  id: 'CAMBODIAN_IVORY_CELEBRATION',
  name: 'Cambodian Ivory Celebration',
  buttonText: '🇰🇭 Ivory Celebration',
  description:
    'Warm ivory sandstone pedestal, subtle golden lotus motif shadows, silk textile textures, soft regal ambiance.',
  cameraPosition: 'Centered architectural perspective, level eye-line.',
  focalLengthFeel: '85mm f/2.0 prime lens, warm regal palette, creamy background falloff.',
  materialPalette: [
    'Warm Cambodian ivory sandstone with chamfered edges',
    'Hand-woven raw silk drapery',
    'Subtle burnished gold undertones',
    'Delicate botanical lotus petal shadows',
  ],
  lightSource:
    'Warm afternoon golden-hour light filtering softly from the upper-left, casting delicate organic botanical shadows.',
  productGroundingSurface:
    'Low tiered pedestal crafted from smooth warm ivory sandstone with elegant chamfered edges.',
  foregroundDensity: 'SPARSE',
  backgroundDepth: 'DEEP_BOKEH',
  negativeSpaceLocation:
    'Centered flat pedestal surface for bottle placement; clear uncluttered top and bottom zones for celebratory typography.',
  prohibitedCliches: [
    'Gaudy glitter explosions',
    'Oversaturated neon yellows',
    'Low-res temple collages',
    'Stereotypical kitsch',
  ],
  buildPrompt: (options?: { layoutIntent?: LayoutIntent; category?: string }): string => {
    const layout = options?.layoutIntent;
    const base = `Commercial luxury fragrance still-life photography for perfume bottle placement. A low tiered pedestal crafted from smooth warm ivory sandstone with elegant chamfered edges, resting on soft neutral raw silk textures. Warm golden-hour illumination streaming from the upper-left, casting soft, elegant shadows of lotus petals and delicate botanical leaves. The background is a soft, warm cream and sandstone architectural setting in creamy bokeh. Shot on 85mm f/2.0 prime lens, warm regal palette, subtle burnished gold undertones, photorealistic textures. Center pedestal surface is completely clean, flat, and empty for hero bottle placement.`;
    if (!layout) return base;
    return `${base} Spatial layout: ${layout.promptGuidance} Illumination direction: ${layout.lightingDirection.toLowerCase().replace(/_/g, ' ')}. Surface baseline at ${Math.round(layout.horizonOrPedestalPosition * 100)}% height. Reserved copy space: ${layout.reservedNegativeSpace.guidance} Strictly avoid rendering any visual markers, lines, or guide boxes.`;
  },
  briefPrompt: (_productNameOrCategory?: string): string => {
    return `Commercial luxury fragrance still-life photography for perfume bottle placement. A low tiered pedestal crafted from smooth warm ivory sandstone with elegant chamfered edges, resting on soft neutral raw silk textures. Warm golden-hour illumination streaming from the upper-left, casting soft, elegant shadows of lotus petals and delicate botanical leaves. The background is a soft, warm cream and sandstone architectural setting in creamy bokeh. Shot on 85mm f/2.0 prime lens, warm regal palette, subtle burnished gold undertones, photorealistic textures. Center pedestal surface is completely clean, flat, and empty for hero bottle placement.`;
  },
  negativePrompt: DEFAULT_BACKGROUND_NEGATIVE_PROMPT,
};

// 5. CLEAN EDITORIAL STUDIO
export const CLEAN_EDITORIAL_STUDIO: StylePresetDefinition = {
  id: 'CLEAN_EDITORIAL_STUDIO',
  name: 'Clean Editorial Studio',
  buttonText: '✨ Editorial Studio',
  description:
    'Minimalist architectural concrete and warm ceramic podium, soft diffused daylight, pristine neutral gradient.',
  cameraPosition: 'Straight-on front perspective, level horizon.',
  focalLengthFeel:
    '90mm studio prime lens, f/5.6 for crisp edge clarity with soft gradient background.',
  materialPalette: [
    'Soft beige architectural ceramic pedestal',
    'Pale micro-cement surface',
    'Neutral matte studio backdrop',
  ],
  lightSource:
    'Large softbox diffused daylight from the upper-left, creating ultra-soft graduated contact shadows.',
  productGroundingSurface: 'Low circular or rectangular soft beige ceramic pedestal.',
  foregroundDensity: 'SPARSE',
  backgroundDepth: 'STUDIO_FALLOFF',
  negativeSpaceLocation:
    'Generous flat negative space on the pedestal and clean, spacious backdrop for flexible typographic placement.',
  prohibitedCliches: [
    'Stark hospital lighting',
    'Harsh digital grey backdrops',
    'Artificial floating bubbles',
    'Distorted wide-angle lens',
  ],
  buildPrompt: (options?: { layoutIntent?: LayoutIntent; category?: string }): string => {
    const layout = options?.layoutIntent;
    const base = `Clean minimalist luxury fragrance studio still-life photography for perfume bottle placement. A neutral soft beige ceramic pedestal resting on a pale micro-cement surface, illuminated by large soft diffused daylight from the upper left. Pristine neutral background with gentle warm greige gradient, elegant high-fashion aesthetic. Generous flat negative space centered for subsequent hero bottle placement. Photorealistic, clean, uncluttered, straight-on perspective.`;
    if (!layout) return base;
    return `${base} Spatial layout: ${layout.promptGuidance} Illumination direction: ${layout.lightingDirection.toLowerCase().replace(/_/g, ' ')}. Surface baseline at ${Math.round(layout.horizonOrPedestalPosition * 100)}% height. Reserved copy space: ${layout.reservedNegativeSpace.guidance} Strictly avoid rendering any visual markers, lines, or guide boxes.`;
  },
  briefPrompt: (_productNameOrCategory?: string): string => {
    return `Clean minimalist luxury fragrance studio still-life photography for perfume bottle placement. A neutral soft beige ceramic pedestal resting on a pale micro-cement surface, illuminated by large soft diffused daylight from the upper left. Pristine neutral background with gentle warm greige gradient, elegant high-fashion aesthetic. Generous flat negative space centered for subsequent hero bottle placement. Photorealistic, clean, uncluttered, straight-on perspective.`;
  },
  negativePrompt: DEFAULT_BACKGROUND_NEGATIVE_PROMPT,
};

export const REFINED_PRESETS: Record<
  | 'PARISIAN_MORNING_ATELIER'
  | 'NOCTURNE_OBSIDIAN'
  | 'BOTANICAL_SCENT_STORY'
  | 'CAMBODIAN_IVORY_CELEBRATION'
  | 'CLEAN_EDITORIAL_STUDIO',
  StylePresetDefinition
> = {
  PARISIAN_MORNING_ATELIER,
  NOCTURNE_OBSIDIAN,
  BOTANICAL_SCENT_STORY,
  CAMBODIAN_IVORY_CELEBRATION,
  CLEAN_EDITORIAL_STUDIO,
};

// 4 distinct options presented to user in creation wizards with backward-compatible IDs
export const FRAGRANCE_STYLE_PRESETS: Record<
  'NOCTURNE_ROYALE' | 'ATELIER_HAUSSMANN' | 'SCENT_PYRAMID' | 'CLASSIC_STUDIO',
  StylePresetDefinition
> = {
  NOCTURNE_ROYALE: { ...NOCTURNE_OBSIDIAN, id: 'NOCTURNE_ROYALE' },
  ATELIER_HAUSSMANN: { ...PARISIAN_MORNING_ATELIER, id: 'ATELIER_HAUSSMANN' },
  SCENT_PYRAMID: { ...BOTANICAL_SCENT_STORY, id: 'SCENT_PYRAMID' },
  CLASSIC_STUDIO: { ...CLEAN_EDITORIAL_STUDIO, id: 'CLASSIC_STUDIO' },
};

export const COSMETIC_STYLE_PRESETS: Record<
  'FRENCH_BOUDOIR' | 'CLEAN_MINIMALIST' | 'CLASSIC_STUDIO',
  StylePresetDefinition
> = {
  FRENCH_BOUDOIR: { ...PARISIAN_MORNING_ATELIER, id: 'FRENCH_BOUDOIR' },
  CLEAN_MINIMALIST: { ...CLEAN_EDITORIAL_STUDIO, id: 'CLEAN_MINIMALIST' },
  CLASSIC_STUDIO: { ...CLEAN_EDITORIAL_STUDIO, id: 'CLASSIC_STUDIO' },
};

export function getStylePresetsForCategory(
  category?: string,
): Record<string, StylePresetDefinition> {
  if (category === 'fragrance') {
    return FRAGRANCE_STYLE_PRESETS;
  }
  return COSMETIC_STYLE_PRESETS;
}

export function resolveStylePreset(presetId?: string, category?: string): StylePresetDefinition {
  if (presetId) {
    const normalizedKey = presetId.trim().toUpperCase();

    // Direct match in Fragrance presets (preserves legacy ID if requested)
    if (normalizedKey in FRAGRANCE_STYLE_PRESETS) {
      return FRAGRANCE_STYLE_PRESETS[normalizedKey as keyof typeof FRAGRANCE_STYLE_PRESETS];
    }

    // Direct match in Cosmetic presets (preserves legacy ID if requested)
    if (normalizedKey in COSMETIC_STYLE_PRESETS) {
      return COSMETIC_STYLE_PRESETS[normalizedKey as keyof typeof COSMETIC_STYLE_PRESETS];
    }

    // Direct match in Refined Presets
    if (normalizedKey in REFINED_PRESETS) {
      return REFINED_PRESETS[normalizedKey as keyof typeof REFINED_PRESETS];
    }

    // Explicit Aliases
    switch (normalizedKey) {
      case 'ATELIER_HAUSSMANN':
      case 'HAUSSMANN':
      case 'PARISIAN_ATELIER':
      case 'FRENCH_BOUDOIR':
        return FRAGRANCE_STYLE_PRESETS.ATELIER_HAUSSMANN;

      case 'NOCTURNE_ROYALE':
      case 'NOCTURNE':
      case 'ROYALE':
        return FRAGRANCE_STYLE_PRESETS.NOCTURNE_ROYALE;

      case 'SCENT_PYRAMID':
      case 'PYRAMID':
      case 'BOTANICAL_STORY':
        return FRAGRANCE_STYLE_PRESETS.SCENT_PYRAMID;

      case 'CAMBODIAN_IVORY':
      case 'KHMER_CELEBRATION':
      case 'IVORY_CELEBRATION':
      case 'CAMBODIAN_CELEBRATION':
        return CAMBODIAN_IVORY_CELEBRATION;

      case 'CLASSIC_STUDIO':
      case 'CLEAN_MINIMALIST':
      case 'STUDIO':
        return FRAGRANCE_STYLE_PRESETS.CLASSIC_STUDIO;
    }
  }

  if (category === 'fragrance') {
    return NOCTURNE_OBSIDIAN;
  }
  return CLEAN_EDITORIAL_STUDIO;
}
