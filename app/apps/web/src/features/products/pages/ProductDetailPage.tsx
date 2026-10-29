import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Package } from 'lucide-react';
import { Button } from '../../../components/ui/button.js';
import { ErrorState } from '../../../components/ui/error-state.js';
import { Skeleton } from '../../../components/ui/skeleton.js';
import { ProductAssetGallery } from '../components/ProductAssetGallery.js';
import { ProductFactsPanel } from '../components/ProductFactsPanel.js';
import { ProductReadinessPanel } from '../components/ProductReadinessPanel.js';
import { useProductDetail, useProductReadiness } from '../hooks/use-products.js';

export const ProductDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();

  const {
    data: product,
    isLoading: isProductLoading,
    isError: isProductError,
    error: productError,
    refetch: refetchProduct,
  } = useProductDetail(id);

  const { data: readiness, isLoading: isReadinessLoading } = useProductReadiness(id);

  if (isProductLoading) {
    return (
      <div className="space-y-6 max-w-7xl mx-auto pb-12 animate-pulse">
        <div className="h-6 w-32 bg-app-surface-subtle rounded" />
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-5 space-y-4">
            <Skeleton className="w-full aspect-square rounded-xl" />
          </div>
          <div className="lg:col-span-7 space-y-6">
            <Skeleton className="h-48 rounded-xl" />
            <Skeleton className="h-48 rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  if (isProductError || !product) {
    return (
      <div className="max-w-2xl mx-auto py-12">
        <ErrorState
          title="Product Snapshot Not Found"
          message={productError?.message || `No product snapshot was found for identifier "${id}".`}
          onRetry={() => void refetchProduct()}
        />
        <div className="text-center mt-6">
          <Link to="/products">
            <Button variant="secondary" size="sm" className="gap-1.5">
              <ArrowLeft className="w-4 h-4" />
              Return to Catalog
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Navigation Breadcrumb / Back Button */}
      <div className="flex items-center justify-between">
        <Link
          to="/products"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-app-muted hover:text-app-primary transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Products Catalog</span>
        </Link>

        <div className="flex items-center gap-2 text-xs text-app-muted">
          <Package className="w-3.5 h-3.5" />
          <span className="font-mono">{product.sku}</span>
        </div>
      </div>

      {/* Main Detail Two-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Asset Gallery & Packshots */}
        <div className="lg:col-span-5 space-y-6">
          <ProductAssetGallery product={product} />
        </div>

        {/* Right Column: Commercial Facts & Readiness Gates */}
        <div className="lg:col-span-7 space-y-6">
          <ProductFactsPanel product={product} />
          <ProductReadinessPanel readiness={readiness} isLoading={isReadinessLoading} />
        </div>
      </div>
    </div>
  );
};
