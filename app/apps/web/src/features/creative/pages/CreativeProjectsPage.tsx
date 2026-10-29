import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Palette, Plus, Search, ArrowRight, Calendar } from 'lucide-react';
import { useCreativeProjects } from '../hooks/use-creative.js';
import { usePermissions } from '../../auth/hooks/use-permissions.js';
import { Permission } from '../../../types/auth.types.js';

export const CreativeProjectsPage: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [campaignFilter] = useState('');
  const { hasPermission } = usePermissions();

  const { data, isLoading, error } = useCreativeProjects({
    search: searchTerm || undefined,
    campaignId: campaignFilter || undefined,
  });

  const canCreate = hasPermission(Permission.EDIT_CREATIVE);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-app-border">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Palette className="w-6 h-6 text-brand-burgundy" />
            <h1 className="text-2xl font-serif font-bold text-app-primary">Creative Studio</h1>
          </div>
          <p className="text-sm text-app-muted">
            Brand-safe luxury poster composition, canvas layout & multi-format rendering
          </p>
        </div>

        {canCreate && (
          <Link
            to="/creative/new"
            className="px-4 py-2.5 rounded-lg bg-brand-burgundy hover:bg-brand-burgundy/90 text-white text-xs font-semibold flex items-center gap-2 transition-colors shadow-sm shrink-0"
          >
            <Plus className="w-4 h-4" />
            New Creative Project
          </Link>
        )}
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-app-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search creative projects by title or SKU..."
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-app-border bg-app-surface text-app-primary text-xs focus:ring-1 focus:ring-brand-burgundy outline-none"
          />
        </div>
      </div>

      {/* Project Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-48 rounded-xl border border-app-border bg-app-surface animate-pulse p-5"
            />
          ))}
        </div>
      ) : error ? (
        <div className="p-8 rounded-xl border border-red-500/20 bg-red-500/5 text-center text-red-400">
          <p className="text-sm font-semibold">Failed to load creative projects</p>
          <p className="text-xs text-app-muted mt-1">{error.message}</p>
        </div>
      ) : data?.items.length === 0 ? (
        <div className="p-12 rounded-2xl border border-dashed border-app-border bg-app-surface text-center space-y-3">
          <Palette className="w-10 h-10 text-app-muted mx-auto opacity-30" />
          <h3 className="text-sm font-semibold text-app-primary">No creative projects found</h3>
          <p className="text-xs text-app-muted max-w-sm mx-auto">
            {searchTerm
              ? 'Try modifying your search criteria.'
              : 'Compose brand-safe marketing posters for products with verified asset rights.'}
          </p>
          {canCreate && !searchTerm && (
            <div className="pt-2">
              <Link
                to="/creative/new"
                className="px-4 py-2 rounded-lg bg-brand-burgundy text-white text-xs font-semibold inline-flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                Create First Poster
              </Link>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {data?.items.map(({ scene, latestVersion, productSnapshot }) => (
            <div
              key={scene.id}
              data-testid={`creative-card-${scene.id}`}
              className="p-5 rounded-2xl border border-app-border bg-app-surface hover:border-brand-burgundy/60 transition-all flex flex-col justify-between group shadow-sm"
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#EAD9BD]/20 text-[#5F4A2C] border border-[#EAD9BD]/40">
                    {productSnapshot.sku}
                  </span>
                  <div className="flex items-center gap-1 text-[11px] font-mono text-brand-burgundy font-semibold">
                    <span>v{scene.currentVersionNumber}</span>
                  </div>
                </div>

                <h3 className="font-serif font-bold text-base text-app-primary group-hover:text-brand-burgundy transition-colors line-clamp-1 mb-1">
                  {scene.title}
                </h3>
                <p className="text-xs text-app-muted truncate mb-3">
                  {productSnapshot.brand} • {productSnapshot.productName}
                </p>

                <div className="flex items-center gap-2 mb-4 text-[11px]">
                  <span className="px-2 py-0.5 rounded bg-app-surface-subtle border border-app-border text-app-primary font-medium">
                    {latestVersion.templateId}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-app-surface-subtle border border-app-border text-app-muted font-mono font-bold">
                    {latestVersion.aspectRatio}
                  </span>
                  <span className="text-app-muted ml-auto font-mono font-semibold text-app-primary">
                    ${productSnapshot.price.toFixed(2)} USD
                  </span>
                </div>
              </div>

              <div className="pt-3 border-t border-app-border/60 flex items-center justify-between">
                <span className="text-[10px] text-app-muted font-mono flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {new Date(scene.updatedAt).toLocaleDateString()}
                </span>
                <Link
                  to={`/creative/projects/${scene.id}`}
                  className="text-xs font-semibold text-brand-burgundy flex items-center gap-1 group-hover:gap-1.5 transition-all"
                >
                  Open Studio
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
