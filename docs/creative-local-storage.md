# Content-Addressable Asset Storage (CAS) Specification

## 1. Overview

The Parisian Shopper AI Creative Automation system employs a Content-Addressable Storage (CAS) design implemented by `DiskAssetStorageAdapter` via the `AssetStoragePort` interface (`@parisian-shopper/application`).

All stored visual assets—including canonical product photography, AI-generated ambient backgrounds, composited creatives, and review previews—are addressed strictly by their cryptographic content digest (`SHA-256`), never by user-supplied filenames.

---

## 2. Storage Directory Layout

Assets are stored under the configured `CREATIVE_ASSET_STORAGE_ROOT` (default: `.data/assets`) using a 2-tier fan-out directory structure:

```text
.data/assets/
├── .tmp/                                      # Atomic staging directory (mode 0o600)
│   └── 3f8a42b1-9c02-4e67-889a-0e92f58d9e21.tmp
└── cas/
    └── 8f/
        └── a4/
            ├── 8fa42b19c024e67889a0e92f58d9e210123456789abcdef0123456789abcdef0.png
            └── 8fa42b19c024e67889a0e92f58d9e210123456789abcdef0123456789abcdef0.png.meta.json
```

### 2.1 Storage Key Format

$$\text{Key} = \text{"cas/"} + \text{sha256}[0..1] + \text{"/"} + \text{sha256}[2..3] + \text{"/"} + \text{sha256} + \text{"."} + \text{ext}$$

- Prefix 1: First 2 characters of hex digest (e.g. `8f`)
- Prefix 2: Next 2 characters of hex digest (e.g. `a4`)
- Filename: Full 64-character hex digest
- Extension: Allowlisted lowercase extension (`png`, `jpg`, `webp`)

---

## 3. Atomic Write and Concurrency Protocol

To prevent partial reads, torn files, or race conditions:

1. **Staging File Creation:**
   The asset buffer is written to a temporary staging file:
   `.tmp/${crypto.randomUUID()}.tmp` with restrictive POSIX mode `0o600` (read/write by owner only).
2. **Disk Flush (`fsync`):**
   `await fileHandle.sync()` guarantees that all bytes are persisted to disk hardware before any indexing or renaming.
3. **Atomic Rename (`fs.rename`):**
   The staging file is renamed into its target CAS path (`cas/ab/cd/<sha256>.<ext>`). On POSIX systems, `rename` is an atomic filesystem operation.
4. **Sidecar Metadata:**
   An accompanying `.meta.json` sidecar file containing `StoredAssetMetadata` (`byteSize`, `mimeType`, `width`, `height`, `assetRole`, `createdAt`, `publicUrl`) is written and flushed atomically following the same staging procedure.
5. **Deduplication:**
   If an asset with the identical SHA-256 digest already exists, redundant disk writes are bypassed, preserving immutable storage space.
6. **Concurrent Write Safety:**
   Parallel writes with identical buffers safely stage to separate temporary UUID files and atomically overwrite or deduplicate into the target path.

---

## 4. Security & Integrity Defenses

| Threat Vector | Defense Mechanism | Enforcement Point |
|---|---|---|
| **Path Traversal / Escape** | Exact Regex validation (`^cas/[0-9a-f]{2}/[0-9a-f]{2}/[0-9a-f]{64}\.(png\|jpe?g\|webp)$`) and `path.resolve` check ensuring target remains strictly within `storageRoot`. | `DiskAssetStorageAdapter.resolveSafePath` |
| **Directory Prefix Mismatch** | Validates that `sub1` matches `digest[0..1]` and `sub2` matches `digest[2..4]`. | `DiskAssetStorageAdapter.validateStorageKey` |
| **Symlink Attacks** | Rejects symbolic links via `fs.lstat` check (`isSymbolicLink()`). | `DiskAssetStorageAdapter.fileExists` |
| **Oversized Asset DOS** | Rejects assets exceeding `CREATIVE_ASSET_MAX_BYTES` (default 10 MB) prior to disk write (`AssetOversizedError`). | `DiskAssetStorageAdapter.saveAsset` |
| **MIME / Extension Spoofing** | Strict allowlist limited to `image/png`, `image/jpeg`, and `image/webp`. Rejects unknown MIME types (`CreativeBriefValidationError`). | `DiskAssetStorageAdapter.saveAsset` |
| **Disk Bitrot / Tampering** | Recomputes SHA-256 digest on read and validates against storage key (`AssetDigestMismatchError`). | `DiskAssetStorageAdapter.getAssetBuffer` |
| **Accidental Deletion** | Normal `AssetStoragePort` interface contains **NO deletion methods**. All historical assets participate in the immutable audit chain. | Interface contract |

---

## 5. Configuration Reference

| Environment Variable | Type | Default | Description |
|---|---|---|---|
| `FEATURE_CREATIVE_GENERATION` | boolean | `false` | Master feature flag for creative workflow. |
| `CREATIVE_PROVIDER` | `'fake'` | `'fake'` | Selected creative background synthesis provider. |
| `CREATIVE_ASSET_STORAGE_ROOT` | string | `'.data/assets'` | Local directory path for CAS asset storage. |
| `CREATIVE_ASSET_MAX_BYTES` | number | `10485760` (10 MB) | Maximum permitted asset file size in bytes. |
| `CREATIVE_ALLOW_FAKE_IN_PRODUCTION` | boolean | `false` | Explicit opt-in required to allow fake creative provider in production. |
