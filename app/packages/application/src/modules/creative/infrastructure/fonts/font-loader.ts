import { FontRegistry } from './font-registry.js';
import './harfbuzz-shaping-service.js';

export interface EmbeddedFonts {
  readonly khmerRegularBase64: string;
  readonly khmerBoldBase64: string;
  readonly latinDisplayBase64: string;
  readonly latinBodyBase64: string;
  readonly fontFaceCss: string;
}

export function loadEmbeddedFonts(): EmbeddedFonts {
  const registry = FontRegistry.getInstance();
  const khmerRegular = registry.getFontById('noto-sans-khmer-regular');
  const khmerBold = registry.getFontById('noto-sans-khmer-bold');
  const latinDisplay = registry.getFontById('playfair-display-variable');
  const latinBody = registry.getFontById('montserrat-variable');

  return {
    khmerRegularBase64: khmerRegular.base64,
    khmerBoldBase64: khmerBold.base64,
    latinDisplayBase64: latinDisplay.base64,
    latinBodyBase64: latinBody.base64,
    fontFaceCss: registry.getFontFaceCss(),
  };
}

export function clearFontCacheForTests(): void {
  FontRegistry.clearCacheForTests();
}
