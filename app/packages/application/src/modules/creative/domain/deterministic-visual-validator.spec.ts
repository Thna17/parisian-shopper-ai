import { createHash } from 'node:crypto';
import { describe, expect, it } from '@jest/globals';
import { DeterministicVisualValidator } from './services/deterministic-visual-validator.js';
import {
  VisualFindingCode,
  VISUAL_VALIDATOR_VERSION,
  type VisualValidationFindingDraft,
} from './visual-validation.js';
import { getPresetFixture } from '../infrastructure/fixtures/fake-background-fixtures.js';

describe('DeterministicVisualValidator', () => {
  const validator = new DeterministicVisualValidator();
  const validBuffer = getPresetFixture('cream', 1080, 1080);
  const validSha256 = createHash('sha256').update(validBuffer).digest('hex');

  it('passes on valid 1080x1080 PNG with matching SHA-256 and 1:1 aspect ratio', async () => {
    const outcome = await validator.validate({
      assetBuffer: validBuffer,
      expectedSha256: validSha256,
      targetAspectRatio: '1:1',
      targetWidth: 1080,
      targetHeight: 1080,
      heroBoundingBox: { x: 200, y: 200, width: 680, height: 680 },
    });

    expect(outcome.validatorVersion).toBe(VISUAL_VALIDATOR_VERSION);
    expect(outcome.status).toBe('PASSED');
    expect(outcome.blockingCount).toBe(0);
    expect(outcome.findings).toHaveLength(0);
  });

  it('fails with CAS_HASH_MISMATCH if SHA-256 does not match buffer content', async () => {
    const outcome = await validator.validate({
      assetBuffer: validBuffer,
      expectedSha256: 'deadbeef'.repeat(8),
      targetAspectRatio: '1:1',
      targetWidth: 1080,
      targetHeight: 1080,
    });

    expect(outcome.status).toBe('FAILED');
    expect(outcome.blockingCount).toBeGreaterThanOrEqual(1);
    const hashFinding = outcome.findings.find(
      (f: VisualValidationFindingDraft) => f.code === VisualFindingCode.CAS_HASH_MISMATCH,
    );
    expect(hashFinding).toBeDefined();
    expect(hashFinding?.severity).toBe('BLOCKING');
  });

  it('fails with ASPECT_RATIO_MISMATCH if actual image ratio differs from target', async () => {
    const outcome = await validator.validate({
      assetBuffer: validBuffer, // 1080x1080 is 1:1
      expectedSha256: validSha256,
      targetAspectRatio: '4:5',
    });

    expect(outcome.status).toBe('FAILED');
    const ratioFinding = outcome.findings.find(
      (f: VisualValidationFindingDraft) => f.code === VisualFindingCode.ASPECT_RATIO_MISMATCH,
    );
    expect(ratioFinding).toBeDefined();
    expect(ratioFinding?.severity).toBe('BLOCKING');
  });

  it('fails with FILE_SIZE_EXCEEDED if byte length exceeds maximum allowed bytes', async () => {
    const smallValidator = new DeterministicVisualValidator({ maxFileSizeBytes: 100 });
    const outcome = await smallValidator.validate({
      assetBuffer: validBuffer,
      expectedSha256: validSha256,
      targetAspectRatio: '1:1',
    });

    expect(outcome.status).toBe('FAILED');
    const sizeFinding = outcome.findings.find(
      (f: VisualValidationFindingDraft) => f.code === VisualFindingCode.FILE_SIZE_EXCEEDED,
    );
    expect(sizeFinding).toBeDefined();
  });

  it('fails with BOUNDING_BOX_OUT_OF_BOUNDS if hero bounding box touches or violates the 5% safe margin', async () => {
    // 1080x1080 canvas: 5% safe margin is 54px left, top, right, bottom
    // x = 10 violates safe margin (left margin requires >= 54)
    const outcome = await validator.validate({
      assetBuffer: validBuffer,
      expectedSha256: validSha256,
      targetAspectRatio: '1:1',
      heroBoundingBox: { x: 10, y: 100, width: 500, height: 500 },
    });

    expect(outcome.status).toBe('FAILED');
    const boxFinding = outcome.findings.find(
      (f: VisualValidationFindingDraft) => f.code === VisualFindingCode.BOUNDING_BOX_OUT_OF_BOUNDS,
    );
    expect(boxFinding).toBeDefined();
    expect(boxFinding?.severity).toBe('BLOCKING');
  });

  it('fails with CONTAINER_UNSUPPORTED or VALIDATOR_INTERNAL_ERROR if buffer is corrupted/not an image', async () => {
    const corruptedBuffer = Buffer.from('NOT_AN_IMAGE_FILE_BUFFER');
    const corruptedSha = createHash('sha256').update(corruptedBuffer).digest('hex');

    const outcome = await validator.validate({
      assetBuffer: corruptedBuffer,
      expectedSha256: corruptedSha,
      targetAspectRatio: '1:1',
    });

    expect(outcome.status).toBe('FAILED');
    expect(outcome.blockingCount).toBeGreaterThanOrEqual(1);
  });

  it('reconciles HardVisualGatesEngine failures into VisualValidationFindingDraft with BLOCKING severity', async () => {
    const outcome = await validator.validateWithHardGates({
      assetBuffer: validBuffer,
      expectedSha256: validSha256,
      aspectRatio: '1:1',
      width: 1080,
      height: 1080,
      heroBoundingBox: { x: 300, y: 300, width: 400, height: 400 },
      ctaBoundingBox: { x: 350, y: 350, width: 200, height: 50 }, // Overlaps hero -> GATE_CTA_HERO_COLLISION
    });

    expect(outcome.status).toBe('FAILED');
    expect(outcome.blockingCount).toBeGreaterThanOrEqual(1);
    const finding = outcome.findings.find(
      (f: VisualValidationFindingDraft) => f.code === VisualFindingCode.BOUNDING_BOX_OUT_OF_BOUNDS,
    );
    expect(finding).toBeDefined();
    expect(finding?.severity).toBe('BLOCKING');
    expect(finding?.metadata?.['hardGateCode']).toBe('GATE_CTA_HERO_COLLISION');
    expect(finding?.metadata?.['remediationAction']).toBeDefined();
  });

  it('evaluates extended hard visual gates directly in validate() when typography blocks are provided', async () => {
    const outcome = await validator.validate({
      assetBuffer: validBuffer,
      expectedSha256: validSha256,
      targetAspectRatio: '1:1',
      targetWidth: 1080,
      targetHeight: 1080,
      heroBoundingBox: { x: 200, y: 200, width: 680, height: 680 },
      typographyBlocks: [
        {
          role: 'headline',
          text: 'Title with unsafe bidi \u202E override',
          box: { x: 100, y: 100, width: 400, height: 50 },
        },
      ],
    });

    expect(outcome.status).toBe('FAILED');
    const finding = outcome.findings.find(
      (f: VisualValidationFindingDraft) => f.code === VisualFindingCode.UNEXPECTED_TEXT_DETECTED,
    );
    expect(finding).toBeDefined();
    expect(finding?.severity).toBe('BLOCKING');
    expect(finding?.metadata?.['hardGateCode']).toBe('GATE_UNSAFE_UNICODE');
  });
});
