import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FourEyesVerificationProof } from '../application/publishing-gateway.port.js';

export class PublishingSafetyInvariantError extends Error {
  public readonly code = 'PUBLISHING_SAFETY_INVARIANT_VIOLATION';
  public constructor(message: string) {
    super(`Publishing safety invariant violation: ${message}`);
    this.name = 'PublishingSafetyInvariantError';
  }
}

export function computeFourEyesSignature(
  data: {
    readonly contentJobId: string;
    readonly contentVersionId: string;
    readonly requesterUserId: string;
    readonly approverUserId: string;
    readonly decision: 'APPROVED';
    readonly approvedAt: string;
  },
  secret: string,
): string {
  const serialized = [
    data.contentJobId,
    data.contentVersionId,
    data.requesterUserId,
    data.approverUserId,
    data.decision,
    data.approvedAt,
  ].join('::');
  return createHmac('sha256', secret).update(serialized).digest('hex');
}

export function verifyFourEyesProof(proof: FourEyesVerificationProof, secret: string): void {
  // 1. Separation of duties check
  if (!proof.approverUserId || !proof.requesterUserId) {
    throw new PublishingSafetyInvariantError('Approver and requester user IDs are required');
  }
  if (proof.approverUserId === proof.requesterUserId) {
    throw new PublishingSafetyInvariantError(
      'Four-Eyes separation of duties violated: Content approver cannot be the content requester',
    );
  }

  // 2. Decision must be strictly APPROVED
  if (proof.decision !== 'APPROVED') {
    throw new PublishingSafetyInvariantError('Approval decision must be APPROVED');
  }

  // 3. Cryptographic signature confirmation
  const expectedSig = computeFourEyesSignature(
    {
      contentJobId: proof.contentJobId,
      contentVersionId: proof.contentVersionId,
      requesterUserId: proof.requesterUserId,
      approverUserId: proof.approverUserId,
      decision: proof.decision,
      approvedAt: proof.approvedAt,
    },
    secret,
  );

  const expectedBuf = Buffer.from(expectedSig, 'utf8');
  const actualBuf = Buffer.from(proof.signature ?? '', 'utf8');

  if (expectedBuf.length !== actualBuf.length || !timingSafeEqual(expectedBuf, actualBuf)) {
    throw new PublishingSafetyInvariantError(
      'Cryptographic Four-Eyes signature verification failed: signature mismatch or untrusted approval proof',
    );
  }
}
