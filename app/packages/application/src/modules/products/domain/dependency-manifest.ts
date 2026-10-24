import { type ProductDependencyScope } from '../application/product-snapshot-hash.js';

export const ArtifactType = {
  COPY: 'COPY',
  VISUAL_POSTER: 'VISUAL_POSTER',
  EXPORT_PACKAGE: 'EXPORT_PACKAGE',
  CAMPAIGN_DRAFT: 'CAMPAIGN_DRAFT',
} as const;

export type ArtifactType = (typeof ArtifactType)[keyof typeof ArtifactType];

export interface DependencyManifest {
  readonly artifactId: string;
  readonly artifactType: ArtifactType;
  readonly productSnapshotId: string;
  readonly requiredScopes: readonly ProductDependencyScope[];
  readonly capturedHashes: Readonly<Record<ProductDependencyScope, string>>;
}
