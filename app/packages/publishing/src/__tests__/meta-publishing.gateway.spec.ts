import { describe, expect, it, jest } from '@jest/globals';
import {
  computeFourEyesSignature,
  type FourEyesVerificationProof,
  type PublishPostPayload,
  PublishingSafetyInvariantError,
} from '@parisian-shopper/application';

import {
  MetaApiError,
  MetaConfigurationError,
  MetaRetryExhaustedError,
} from '../meta-publishing.errors.js';
import { MetaPublishingGateway } from '../meta-publishing.gateway.js';

describe('MetaPublishingGateway', () => {
  const secret = 'test-four-eyes-secret-key-32chars!!';
  const approvedAt = new Date('2026-11-04T12:00:00Z').toISOString();

  const validProof: FourEyesVerificationProof = {
    contentJobId: 'job-123',
    contentVersionId: 'ver-456',
    requesterUserId: 'user-author-001',
    approverUserId: 'user-approver-002',
    decision: 'APPROVED',
    approvedAt,
    signature: computeFourEyesSignature(
      {
        contentJobId: 'job-123',
        contentVersionId: 'ver-456',
        requesterUserId: 'user-author-001',
        approverUserId: 'user-approver-002',
        decision: 'APPROVED',
        approvedAt,
      },
      secret,
    ),
  };

  const validFacebookPayload: PublishPostPayload = {
    publicationId: 'pub-fb-001',
    channel: 'FACEBOOK_PAGE',
    targetAccountId: 'page-100200',
    imageUrl: 'https://cdn.example.com/products/parisian-wrap.png',
    caption: '✨ Cashmere elegance from Paris. Verified Authentic.',
    contentJobStatus: 'APPROVED',
    fourEyesProof: validProof,
  };

  const validInstagramPayload: PublishPostPayload = {
    publicationId: 'pub-ig-001',
    channel: 'INSTAGRAM',
    targetAccountId: 'ig-account-900',
    imageUrl: 'https://cdn.example.com/products/parisian-wrap.png',
    caption: '✨ Cashmere elegance from Paris. Verified Authentic.',
    contentJobStatus: 'APPROVED',
    fourEyesProof: validProof,
  };

  describe('Publishing Safety Invariants', () => {
    it('rejects publishing when content job status is not APPROVED', async () => {
      const gateway = new MetaPublishingGateway({ fourEyesSecret: secret });

      const invalidPayload: PublishPostPayload = {
        ...validFacebookPayload,
        contentJobStatus: 'DRAFT' as unknown as 'APPROVED',
      };

      await expect(gateway.publishPost(invalidPayload)).rejects.toThrow(
        PublishingSafetyInvariantError,
      );
    });

    it('rejects publishing when Four-Eyes approver is the same as requester', async () => {
      const selfApprovalProof: FourEyesVerificationProof = {
        contentJobId: 'job-123',
        contentVersionId: 'ver-456',
        requesterUserId: 'user-same-001',
        approverUserId: 'user-same-001',
        decision: 'APPROVED',
        approvedAt,
        signature: 'dummy-signature',
      };

      const gateway = new MetaPublishingGateway({ fourEyesSecret: secret });

      await expect(
        gateway.publishPost({
          ...validFacebookPayload,
          fourEyesProof: selfApprovalProof,
        }),
      ).rejects.toThrow(PublishingSafetyInvariantError);
    });

    it('rejects publishing when cryptographic Four-Eyes signature is tampered or invalid', async () => {
      const tamperedProof: FourEyesVerificationProof = {
        ...validProof,
        signature: 'tampered-signature-digest',
      };

      const gateway = new MetaPublishingGateway({ fourEyesSecret: secret });

      await expect(
        gateway.publishPost({
          ...validFacebookPayload,
          fourEyesProof: tamperedProof,
        }),
      ).rejects.toThrow(PublishingSafetyInvariantError);
    });
  });

  describe('Facebook Page Publishing', () => {
    it('successfully publishes photo to Facebook Page via POST /{page-id}/photos', async () => {
      const mockFetch = jest.fn<typeof fetch>().mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'photo-111', post_id: 'page-100200_photo-111' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const gateway = new MetaPublishingGateway({
        fourEyesSecret: secret,
        defaultAccessToken: 'meta-access-token-xyz',
        fetchFn: mockFetch,
      });

      const result = await gateway.publishPost(validFacebookPayload);

      expect(result.success).toBe(true);
      expect(result.channel).toBe('FACEBOOK_PAGE');
      expect(result.externalPublicationId).toBe('page-100200_photo-111');
      expect(result.permalinkUrl).toContain('facebook.com/page-100200_photo-111');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0]!;
      expect(url).toEqual(expect.stringContaining('/page-100200/photos'));
      expect(init?.method).toBe('POST');
      expect(init?.body).toContain(
        'url=https%3A%2F%2Fcdn.example.com%2Fproducts%2Fparisian-wrap.png',
      );
    });

    it('throws MetaConfigurationError if page ID is missing', async () => {
      const gateway = new MetaPublishingGateway({
        fourEyesSecret: secret,
        defaultAccessToken: 'meta-access-token-xyz',
      });

      const payloadWithoutPage: PublishPostPayload = {
        ...validFacebookPayload,
        targetAccountId: null,
      };

      await expect(gateway.publishPost(payloadWithoutPage)).rejects.toThrow(MetaConfigurationError);
    });
  });

  describe('Instagram Professional Publishing', () => {
    it('successfully publishes photo via 2-step container create and publish flow', async () => {
      const mockFetch = jest
        .fn<typeof fetch>()
        // Step 1: POST /{ig-user-id}/media -> returns creation ID
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ id: 'container-creation-999' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        )
        // Step 2: POST /{ig-user-id}/media_publish -> returns media ID
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ id: 'ig-media-post-888' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );

      const gateway = new MetaPublishingGateway({
        fourEyesSecret: secret,
        defaultAccessToken: 'meta-access-token-xyz',
        fetchFn: mockFetch,
      });

      const result = await gateway.publishPost(validInstagramPayload);

      expect(result.success).toBe(true);
      expect(result.channel).toBe('INSTAGRAM');
      expect(result.externalPublicationId).toBe('ig-media-post-888');
      expect(result.permalinkUrl).toContain('instagram.com/p/ig-media-post-888');

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch.mock.calls[0]![0]).toEqual(expect.stringContaining('/ig-account-900/media'));
      expect(mockFetch.mock.calls[1]![0]).toEqual(
        expect.stringContaining('/ig-account-900/media_publish'),
      );
      expect(mockFetch.mock.calls[1]![1]?.body).toContain('creation_id=container-creation-999');
    });
  });

  describe('Transient Error Retry & Exponential Backoff', () => {
    it('retries with exponential backoff on transient Meta error subcode 2207001 (container processing)', async () => {
      const mockFetch = jest
        .fn<typeof fetch>()
        // Step 1: container created
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ id: 'container-999' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        )
        // Step 2 Attempt 1: Transient 2207001 error
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              error: {
                message: 'Media container not ready yet',
                code: 9007,
                error_subcode: 2207001,
                is_transient: true,
              },
            }),
            { status: 400, headers: { 'Content-Type': 'application/json' } },
          ),
        )
        // Step 2 Attempt 2: Success
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ id: 'ig-media-post-999' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );

      const gateway = new MetaPublishingGateway({
        fourEyesSecret: secret,
        defaultAccessToken: 'meta-access-token-xyz',
        fetchFn: mockFetch,
        initialBackoffMs: 10,
        maxRetries: 2,
      });

      const result = await gateway.publishPost(validInstagramPayload);

      expect(result.success).toBe(true);
      expect(result.externalPublicationId).toBe('ig-media-post-999');
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('retries on HTTP 500 transient internal server error', async () => {
      const mockFetch = jest
        .fn<typeof fetch>()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              error: {
                message: 'An unknown error occurred on Meta servers',
                code: 500,
              },
            }),
            { status: 500, headers: { 'Content-Type': 'application/json' } },
          ),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ id: 'photo-retry-ok', post_id: 'page_photo_ok' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );

      const gateway = new MetaPublishingGateway({
        fourEyesSecret: secret,
        defaultAccessToken: 'meta-access-token-xyz',
        fetchFn: mockFetch,
        initialBackoffMs: 10,
        maxRetries: 2,
      });

      const result = await gateway.publishPost(validFacebookPayload);

      expect(result.success).toBe(true);
      expect(result.externalPublicationId).toBe('page_photo_ok');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('throws immediately without retrying on non-transient 400 bad request error', async () => {
      const mockFetch = jest.fn<typeof fetch>().mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              message: 'Invalid parameter: aspect ratio exceeds maximum permitted',
              code: 100,
              error_subcode: 2207008,
            },
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } },
        ),
      );

      const gateway = new MetaPublishingGateway({
        fourEyesSecret: secret,
        defaultAccessToken: 'meta-access-token-xyz',
        fetchFn: mockFetch,
        initialBackoffMs: 10,
        maxRetries: 3,
      });

      await expect(gateway.publishPost(validFacebookPayload)).rejects.toThrow(MetaApiError);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('throws MetaRetryExhaustedError when transient errors exceed maxRetries', async () => {
      const mockFetch = jest.fn<typeof fetch>().mockImplementation(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              error: {
                message: 'Persistent internal error',
                code: 500,
              },
            }),
            { status: 500, headers: { 'Content-Type': 'application/json' } },
          ),
        ),
      );

      const gateway = new MetaPublishingGateway({
        fourEyesSecret: secret,
        defaultAccessToken: 'meta-access-token-xyz',
        fetchFn: mockFetch,
        initialBackoffMs: 5,
        maxRetries: 2,
      });

      await expect(gateway.publishPost(validFacebookPayload)).rejects.toThrow(
        MetaRetryExhaustedError,
      );
      // 1 initial + 2 retries = 3 total attempts
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });
  });
});
