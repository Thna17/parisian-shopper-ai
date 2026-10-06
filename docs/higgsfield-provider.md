# Higgsfield Seedance video provider

**Status:** production adapter implemented; live generation `BLOCKED_EXTERNAL_CREDITS`

**SDK:** `@higgsfield/client@0.2.6`

**Supported model:** `bytedance/seedance-2.5/text-to-video`

## Provider decision

Higgsfield is the current real video provider. Tests use an internal `HiggsfieldSdkClient` mock and never contact Higgsfield. `FakeCreativeProvider` remains the image/background test provider; local open-source media providers remain deferred.

Video and image contracts are intentionally separate:

```text
VideoCreativeBrief
  -> CreativeVideoProvider
  -> HiggsfieldVideoProvider
  -> HiggsfieldSdkClient
  -> @higgsfield/client/v2 subscribe()
  -> Seedance 2.5
```

`CreativeVideoProvider` is not an extension of the image `CreativeProvider` and has no background-generation, compositing, or publishing methods.

## Official API contract

Sources verified on 2026-10-06:

- <https://docs.higgsfield.ai/docs/how-to/sdk>
- <https://open.higgsfield.ai/models/bytedance/seedance-2.5/text-to-video/api-reference>

The server-side SDK uses `HF_CREDENTIALS` in `KEY_ID:KEY_SECRET` form and sends `Authorization: Key KEY_ID:KEY_SECRET`. The adapter calls:

```typescript
higgsfield.subscribe("bytedance/seedance-2.5/text-to-video", {
  input: {
    prompt,
    duration,
    resolution,
    aspect_ratio,
    output_format,
    generate_audio,
  },
  withPolling: true,
});
```

The current installed TypeScript v2 client exposes `subscribe` and configuration. It does not expose documented public `status`, `result`, or `cancel` methods. Explicit lifecycle control is documented for the Python SDK, not the installed TypeScript surface. No internal SDK method is used.

The installed SDK performs submission and automatic polling. Submission retries are explicitly configured to zero because retrying an ambiguous paid POST without an application-owned idempotency key could create duplicate generations. The provider applies an application deadline around the SDK call. A deadline is recorded as `UNKNOWN_PROVIDER_STATE`; it does not prove that Higgsfield failed or canceled the remote request.

Known SDK limitation: version 0.2.6 does not expose the accepted request ID to the caller while `subscribe` is polling. A polling timeout therefore cannot reliably preserve the provider request ID. A completed or terminal response retains `request_id` when returned. Reconciliation and cancellation require a future documented TypeScript lifecycle API or a separately reviewed direct HTTP client.

## Seedance 2.5 validation

The application validates before submission:

| Field          | Allowed value                                        |
| -------------- | ---------------------------------------------------- |
| Prompt         | Trimmed, non-empty; application cap 4,000 characters |
| Duration       | Integer from 4 through 30 seconds                    |
| Resolution     | `480p`, `720p`, `1080p`                              |
| Aspect ratio   | `16:9`, `4:3`, `1:1`, `3:4`, `9:16`, `21:9`          |
| Output format  | `mp4`, `mov`                                         |
| Generate audio | Boolean; application default is `false`              |

The initial profile is 5 seconds, `720p`, `16:9`, MP4. The model allowlist contains only `bytedance/seedance-2.5/text-to-video`; unknown IDs fail configuration validation and provider construction.

## Error mapping and retries

| Provider/SDK outcome     | Stable code                       | Retry classification                   |
| ------------------------ | --------------------------------- | -------------------------------------- |
| Insufficient credits     | `HIGGSFIELD_INSUFFICIENT_CREDITS` | `PERMANENT_UNTIL_ACCOUNT_ACTION`       |
| Invalid credentials      | `HIGGSFIELD_AUTH_FAILED`          | `PERMANENT_UNTIL_CONFIGURATION_CHANGE` |
| HTTP 429                 | `HIGGSFIELD_RATE_LIMITED`         | `TRANSIENT_WITH_BACKOFF`               |
| Moderation/NSFW          | `HIGGSFIELD_MODERATION_BLOCKED`   | `DO_NOT_RETRY_SAME_CONTENT`            |
| Terminal failure         | `HIGGSFIELD_GENERATION_FAILED`    | `TRANSIENT_WITH_BACKOFF`               |
| Canceled                 | `HIGGSFIELD_REQUEST_CANCELED`     | `UNKNOWN_PROVIDER_STATE`               |
| Poll/application timeout | `HIGGSFIELD_PROVIDER_TIMEOUT`     | `UNKNOWN_PROVIDER_STATE`               |
| Missing/unsafe result    | `HIGGSFIELD_RESULT_INVALID`       | `DO_NOT_RETRY_SAME_CONTENT`            |

No provider error contains raw response bodies, credentials, authorization headers, or signed URLs. The current SDK error surface does not preserve `Retry-After`, so this adapter cannot safely expose it. Higher-level job orchestration must not automatically retry credits, authentication, moderation, invalid input, cancellation, or unknown-state outcomes.

## Configuration and activation

Safe defaults:

```dotenv
FEATURE_CREATIVE_GENERATION=false
FEATURE_HIGGSFIELD_PROVIDER=false
FEATURE_PRODUCT_IMAGE_TO_VIDEO=false
CREATIVE_VIDEO_PROVIDER=higgsfield
HIGGSFIELD_VIDEO_MODEL=bytedance/seedance-2.5/text-to-video
HIGGSFIELD_VIDEO_MAX_WAIT_MS=300000
HIGGSFIELD_GENERATE_AUDIO=false
HF_CREDENTIALS=
RUN_HIGGSFIELD_LIVE_TESTS=false
```

`HF_CREDENTIALS` is required only when creative generation and the Higgsfield provider are both enabled. Credentials remain server-side and must be supplied by deployment secrets or the ignored local `.env.local` file.

## Result and storage boundary

A successful provider result contains the provider/model, optional request ID, temporary HTTPS video URL, requested duration/resolution/aspect ratio, and known MIME type. It deliberately does not claim byte size, dimensions, digest, or duration extracted from media bytes.

Video download and persistence are deferred. The existing `AssetStoragePort` stores bytes safely, but its role taxonomy and persistence model are image-specific (`VisualAssetRole`). Forcing video through that contract would misrepresent the asset. A subsequent PR must add a media-safe ingestion boundary with provider-host policy, DNS/IP and redirect checks, byte/time limits, MP4/MOV magic validation, media inspection, SHA-256, and CAS persistence before a URL can become a durable asset.

Product image-to-video remains disabled. Generative motion can deform product geometry, logos, bottle/box typography, watch dials, and colors; enabling it requires a separately approved visual-fidelity policy.

## Manual smoke test

The manual script is isolated at `app/examples/higgsfield-seedance/index.ts`. It requires both local values:

```dotenv
RUN_HIGGSFIELD_LIVE_TESTS=true
HF_CREDENTIALS=KEY_ID:KEY_SECRET
```

Run `pnpm higgsfield:seedance` manually. It can create a billable request and must never run in CI. It emits a video URL only after `completed` with a non-empty result. Other outcomes are labeled `AUTH_FAILURE`, `BLOCKED_INSUFFICIENT_CREDITS`, `MODERATION_BLOCKED`, `CANCELED`, `PROVIDER_FAILURE`, or `TIMEOUT` without raw provider data.

## Live verification status

- **Higgsfield live connectivity:** PARTIALLY VERIFIED
- **Authentication/API request:** reached provider billing validation
- **Generation:** NOT VERIFIED
- **Video result:** NOT VERIFIED
- **Status:** `BLOCKED_EXTERNAL_CREDITS`
- **Blocker:** Higgsfield account has insufficient credits

No automatic paid retry is permitted. This status may change only after an explicitly authorized smoke test completes and returns a video URL.
