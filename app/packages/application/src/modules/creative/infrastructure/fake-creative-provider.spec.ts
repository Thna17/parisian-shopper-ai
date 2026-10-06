import { describe, expect, it, beforeEach } from '@jest/globals';
import { type CreativeBrief } from '../application/creative-provider.port.js';
import {
  CreativeBriefValidationError,
  CreativeProviderProductionGuardError,
  FakeCreativeProviderError,
  FakeCreativeProviderTimeoutError,
} from '../domain/creative-errors.js';
import { FakeCreativeProvider } from './fake-creative-provider.js';
import { isPngBuffer } from './fixtures/fake-background-fixtures.js';

describe('FakeCreativeProvider', () => {
  let provider: FakeCreativeProvider;

  const validBrief: CreativeBrief = {
    creativeJobId: 'job_test_123',
    contentVersionId: 'ver_test_456',
    briefText: 'Minimalist luxury perfume pedestal on marble',
    stylePrompt: 'Parisian Luxury Atelier with warm natural window light',
    negativePrompt: 'blurry, oversaturated, human faces',
    targetWidth: 1080,
    targetHeight: 1080,
    aspectRatio: '1:1',
    creativeProfile: 'PARISIAN_LUXURY_ATELIER',
  };

  beforeEach(() => {
    provider = new FakeCreativeProvider({
      isProduction: false,
      allowFakeInProduction: false,
    });
  });

  describe('contract and boundary enforcement', () => {
    it('implements CreativeProvider and identifies as fake-creative-provider', () => {
      expect(provider.providerId).toBe('fake-creative-provider');
      expect(typeof provider.generateBackground).toBe('function');
      // Invariant: CreativeProvider does not perform compositing
      expect('compositeVisual' in provider).toBe(false);
    });

    it('generates a valid PNG byte buffer with correct dimensions', async () => {
      const asset = await provider.generateBackground(validBrief);

      expect(asset.providerId).toBe('fake-creative-provider');
      expect(asset.mimeType).toBe('image/png');
      expect(asset.width).toBe(1080);
      expect(asset.height).toBe(1080);
      expect(isPngBuffer(asset.imageBuffer)).toBe(true);
      expect(asset.latencyMs).toBeGreaterThan(0);
      expect(asset.estimatedCostUsd).toBe(0);
      expect(asset.metadata).toBeDefined();
    });
  });

  describe('determinism', () => {
    it('produces identical byte output for the same brief and seed', async () => {
      const runA = await provider.generateBackground(validBrief, { seed: 42 });
      const runB = await provider.generateBackground(validBrief, { seed: 42 });

      expect(runA.imageBuffer.equals(runB.imageBuffer)).toBe(true);
      expect(runA.seed).toBe(42);
      expect(runB.seed).toBe(42);
    });

    it('produces different byte output for different seeds', async () => {
      const runA = await provider.generateBackground(validBrief, { seed: 42 });
      const runB = await provider.generateBackground(validBrief, { seed: 99 });

      expect(runA.imageBuffer.equals(runB.imageBuffer)).toBe(false);
    });

    it('derives stable seed deterministically when no seed is supplied in options', async () => {
      const runA = await provider.generateBackground(validBrief);
      const runB = await provider.generateBackground(validBrief);

      expect(runA.seed).toBe(runB.seed);
      expect(runA.imageBuffer.equals(runB.imageBuffer)).toBe(true);
    });
  });

  describe('brief validation', () => {
    it('rejects missing or empty briefText', async () => {
      await expect(provider.generateBackground({ ...validBrief, briefText: '' })).rejects.toThrow(
        CreativeBriefValidationError,
      );
    });

    it('rejects missing or empty stylePrompt', async () => {
      await expect(
        provider.generateBackground({ ...validBrief, stylePrompt: '   ' }),
      ).rejects.toThrow(CreativeBriefValidationError);
    });

    it('rejects invalid dimensions (<= 0)', async () => {
      await expect(provider.generateBackground({ ...validBrief, targetWidth: 0 })).rejects.toThrow(
        CreativeBriefValidationError,
      );

      await expect(
        provider.generateBackground({ ...validBrief, targetHeight: -500 }),
      ).rejects.toThrow(CreativeBriefValidationError);
    });

    it('rejects dimensions exceeding maximum bounds', async () => {
      await expect(
        provider.generateBackground({ ...validBrief, targetWidth: 5000 }),
      ).rejects.toThrow(CreativeBriefValidationError);
    });

    it('rejects missing creativeProfile', async () => {
      await expect(
        provider.generateBackground({ ...validBrief, creativeProfile: '' }),
      ).rejects.toThrow(CreativeBriefValidationError);
    });

    it('rejects missing creativeJobId or contentVersionId', async () => {
      await expect(
        provider.generateBackground({ ...validBrief, creativeJobId: '' }),
      ).rejects.toThrow(CreativeBriefValidationError);

      await expect(
        provider.generateBackground({ ...validBrief, contentVersionId: '' }),
      ).rejects.toThrow(CreativeBriefValidationError);
    });
  });

  describe('production guard', () => {
    it('fails closed in production when fake is not explicitly allowed', async () => {
      const prodProvider = new FakeCreativeProvider({
        isProduction: true,
        allowFakeInProduction: false,
      });

      await expect(prodProvider.generateBackground(validBrief)).rejects.toThrow(
        CreativeProviderProductionGuardError,
      );
    });

    it('allows generation in production when explicitly permitted', async () => {
      const permittedProdProvider = new FakeCreativeProvider({
        isProduction: true,
        allowFakeInProduction: true,
      });

      const asset = await permittedProdProvider.generateBackground(validBrief);
      expect(asset.providerId).toBe('fake-creative-provider');
      expect(isPngBuffer(asset.imageBuffer)).toBe(true);
    });
  });

  describe('controlled failure modes and test doubles', () => {
    it('simulates external provider error when configured', async () => {
      provider.setFailureMode({
        type: 'error',
        message: 'GPU memory allocation failed',
      });

      await expect(provider.generateBackground(validBrief)).rejects.toThrow(
        FakeCreativeProviderError,
      );
      await expect(provider.generateBackground(validBrief)).rejects.toThrow(
        'GPU memory allocation failed',
      );
    });

    it('simulates provider timeout when configured', async () => {
      provider.setFailureMode({
        type: 'timeout',
        delayMs: 2500,
      });

      await expect(provider.generateBackground(validBrief)).rejects.toThrow(
        FakeCreativeProviderTimeoutError,
      );
    });

    it('simulates corrupt buffer generation', async () => {
      provider.setFailureMode({ type: 'corrupt_buffer' });

      const asset = await provider.generateBackground(validBrief);
      expect(isPngBuffer(asset.imageBuffer)).toBe(false);
      expect(asset.metadata?.['corrupted']).toBe(true);
    });

    it('tracks invocation history and clears on reset', async () => {
      await provider.generateBackground(validBrief, { seed: 1 });
      await provider.generateBackground(validBrief, { seed: 2 });

      expect(provider.getCallHistory()).toHaveLength(2);
      expect(provider.getCallHistory()[0]!.options?.seed).toBe(1);
      expect(provider.getCallHistory()[1]!.options?.seed).toBe(2);

      provider.reset();
      expect(provider.getCallHistory()).toHaveLength(0);

      // Verify normal generation resumes after reset
      const asset = await provider.generateBackground(validBrief);
      expect(isPngBuffer(asset.imageBuffer)).toBe(true);
    });
  });
});
