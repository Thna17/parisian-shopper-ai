import React from 'react';
import { Link } from 'react-router-dom';
import { PanelsTopLeft, ArrowRight } from 'lucide-react';
import { useCreativeTemplates } from '../hooks/use-creative.js';
import { usePermissions } from '../../auth/hooks/use-permissions.js';
import { Permission } from '../../../types/auth.types.js';
export function CreativeTemplatesPage(): React.JSX.Element {
  const query = useCreativeTemplates();
  const { hasPermission } = usePermissions();
  return (
    <section className="space-y-6">
      <header>
        <p className="workspace-eyebrow">Create / Templates</p>
        <h1 className="mt-2 text-3xl font-semibold">Poster templates</h1>
        <p className="mt-2 text-sm text-app-muted">
          Layouts registered by the application. Your product, Caption and saved artwork remain
          connected to their existing records.
        </p>
      </header>
      {query.isLoading && <p role="status">Loading registered templates…</p>}
      {query.isError && (
        <p role="alert">
          Templates could not be loaded.{' '}
          <button className="workspace-link" onClick={() => void query.refetch()}>
            Try again
          </button>
        </p>
      )}
      {query.data?.length === 0 && (
        <p>No templates are registered. Ask an administrator to configure the template catalog.</p>
      )}
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {query.data?.map((template) => (
          <article key={template.id} className="workspace-panel">
            <div className="mb-5 flex aspect-[16/9] items-center justify-center rounded-lg border border-app-border bg-app-bg">
              <PanelsTopLeft className="h-12 w-12 text-gold-500" aria-hidden="true" />
            </div>
            <h2 className="text-base font-semibold">{template.name}</h2>
            <p className="mt-2 text-sm leading-6 text-app-muted">{template.description}</p>
            <p className="my-4 text-xs text-app-muted">
              {template.supportedAspectRatios.join(' · ')} · Version {template.version}
            </p>
            {hasPermission(Permission.EDIT_CREATIVE) && (
              <Link
                className="workspace-link inline-flex items-center gap-2"
                to={'/creative/new?template=' + encodeURIComponent(template.id)}
              >
                Use this layout <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            )}
          </article>
        ))}
      </div>
      <p className="text-xs text-app-muted">
        Layout symbols describe templates; they are not generated poster previews. No generation
        starts by viewing or choosing a template.
      </p>
    </section>
  );
}
