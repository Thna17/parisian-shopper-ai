import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { PostsListPage } from '../../posts/pages/PostsListPage.js';
import { CreativeProjectsPage } from './CreativeProjectsPage.js';
export function CreativeLibraryPage(): React.JSX.Element {
  const [params, setParams] = useSearchParams();
  const tab = params.get('view') === 'projects' ? 'projects' : 'posts';
  return (
    <section className="space-y-6">
      <header>
        <p className="workspace-eyebrow">Create / Creative Library</p>
        <h1 className="mt-2 text-3xl font-semibold">Creative Library</h1>
        <p className="mt-2 text-sm text-app-muted">
          Find saved complete posts and existing standalone poster projects. Previous records and
          review histories remain available.
        </p>
      </header>
      <nav aria-label="Creative library views" className="workspace-tabs">
        <button type="button" aria-pressed={tab === 'posts'} onClick={() => setParams({})}>
          Saved posts
        </button>
        <button
          type="button"
          aria-pressed={tab === 'projects'}
          onClick={() => setParams({ view: 'projects' })}
        >
          Poster projects
        </button>
      </nav>
      {tab === 'posts' ? <PostsListPage scope="all" /> : <CreativeProjectsPage />}
    </section>
  );
}
