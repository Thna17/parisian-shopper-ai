import { ProductEligibilityPanel } from '../components/ProductEligibilityPanel.js';
import { PostCaptionPanel } from './PostCaptionPanel.js';
import { PostJourney } from '../components/PostJourney.js';
import {
  CreationChoices,
  defaultCreationPlan,
  purposeLabels,
  styleLabels,
} from '../components/CreationChoices.js';
import { PostVariationPanel } from '../components/PostVariationPanel.js';
import { usePermissions } from '../../auth/hooks/use-permissions.js';
import { Permission } from '../../../types/auth.types.js';
import React, { useState, useEffect, useRef } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiClientError } from '../../../types/api.types.js';
import { UnsavedPostGuard } from '../UnsavedPostGuard.js';
import { ApprovedPostActions } from './ApprovedPostActions.js';
import { PostGenerationPanel } from './PostGenerationPanel.js';
import { PostDraftPage } from './PostDraftPage.js';
import { postsApi, postStatusLabel, type PostInput, type StaffPost } from '../api/posts-api.js';

const button =
  'inline-flex min-h-11 items-center rounded-lg bg-[#20313d] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700';
const inputClass =
  'w-full rounded-lg border border-neutral-300 bg-white p-2 text-neutral-900 focus-visible:outline-2 focus-visible:outline-amber-700';

export function PostWorkspacePage(): React.JSX.Element {
  const { id = '' } = useParams();
  const query = useQuery({
    queryKey: ['staff-post', id],
    queryFn: () => postsApi.get(id),
    retry: false,
  });
  if (query.isLoading) return <p role="status">Loading your post…</p>;
  // Previously shared /posts/:id links used caption IDs. Keep them readable.
  if (query.error instanceof ApiClientError && query.error.status === 404) return <PostDraftPage />;
  if (query.isError || !query.data)
    return (
      <div role="alert">
        Could not load this post.{' '}
        <button className="underline" onClick={() => void query.refetch()}>
          Try again
        </button>
        <p>
          <Link to="/posts" className="underline">
            Back to posts
          </Link>
        </p>
      </div>
    );
  return <Workspace key={`${id}-${query.data.revisionNumber}`} post={query.data} />;
}

function Workspace({ post }: { post: StaffPost }): React.JSX.Element {
  const cache = useQueryClient();
  const canManageBudget = usePermissions().hasPermission(Permission.MANAGE_AI_BUDGETS);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, [post.currentRevision.id]);
  const generation = useQuery({
    queryKey: ['post-generation', post.id],
    queryFn: () => postsApi.generation(post.id),
    enabled: post.canEdit || canManageBudget,
    retry: false,
  });
  const generationStatus = generation.data?.generation?.status;
  const [captionBusy, setCaptionBusy] = useState(false);
  const [captionState, setCaptionState] = useState('');
  const generationBusy = Boolean(
    captionBusy || (generationStatus && !['COMPLETE', 'FAILED'].includes(generationStatus)),
  );
  const revision = post.currentRevision;
  const initialForm: PostInput = {
    creationPlan: revision.creationPlan ?? null,
    generationId: revision.generationId ?? null,
    captionDraft:
      revision.captionDraft ??
      post.caption ??
      revision.generation?.caption ??
      revision.captionVersion?.structuredOutput ??
      null,
    productSnapshotId: revision.productSnapshotId,
    brief: revision.brief,
    channel: revision.channel,
    language: revision.language,
    campaignId: revision.campaignId ?? null,
    captionVersionId: revision.captionVersionId ?? null,
    posterVersionId: revision.posterVersionId ?? null,
    visualAssetId: revision.visualAssetId ?? null,
  };
  const [form, setForm] = useState<PostInput>(initialForm);
  const [hashtagText, setHashtagText] = useState(
    (
      revision.captionDraft ??
      post.caption ??
      revision.generation?.caption ??
      revision.captionVersion?.structuredOutput
    )?.hashtags.join(' ') ?? '',
  );
  const [comment, setComment] = useState('');
  const [editing, setEditing] = useState(false);
  const editor = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (editing) editor.current?.focus();
  }, [editing]);
  const [imageFailed, setImageFailed] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [dirty, setDirty] = useState(false);
  const candidates = useQuery({
    queryKey: ['post-candidates', post.id, post.revisionNumber],
    queryFn: () => postsApi.candidates(post.id),
    enabled: post.canEdit && !revision.generationId,
  });
  const save = useMutation({
    mutationFn: () =>
      postsApi.revise(post.id, post.revisionNumber, {
        ...form,
        captionDraft: form.captionDraft
          ? { ...form.captionDraft, hashtags: hashtagText.split(/\s+/).filter(Boolean) }
          : null,
      }),
    onSuccess: async (result) => {
      setDirty(false);
      setComment('');
      cache.setQueryData(['staff-post', post.id], result);
      await cache.invalidateQueries({ queryKey: ['staff-posts'] });
    },
  });
  const action = useMutation({
    mutationFn: (value: 'SUBMIT' | 'APPROVE' | 'REQUEST_CHANGES' | 'REJECT') =>
      postsApi.action(post.id, post.revisionNumber, value, comment, post.reviewRound),
    onSuccess: async (result) => {
      setDirty(false);
      setComment('');
      cache.setQueryData(['staff-post', post.id], result);
      await cache.invalidateQueries({ queryKey: ['staff-posts'] });
    },
  });
  function update(patch: Partial<PostInput>) {
    setForm((previous) => ({ ...previous, ...patch }));
    setDirty(true);
  }
  const caption =
    post.caption ??
    revision.captionDraft ??
    revision.generation?.caption ??
    revision.captionVersion?.structuredOutput;
  const chosenPoster = candidates.data?.posters.find((p) => p.id === form.posterVersionId);
  const complete = Boolean(
    (revision.captionVersionId && revision.posterVersionId && revision.visualAssetId) ||
    revision.generation?.status === 'COMPLETE',
  );
  const next =
    captionState === 'UNCERTAIN'
      ? 'Check the saved caption request below. Do not generate again while the provider outcome is unknown.'
      : generationStatus === 'AWAITING_CONFIRMATION' && (post.canEdit || canManageBudget)
        ? 'Review the exact prepared request and credit quote below before authorizing spending.'
        : generationBusy
          ? generationStatus === 'UNCERTAIN'
            ? 'Check the existing image request below. Do not submit another request while its outcome is unknown.'
            : 'Your draft is being prepared. Progress is saved; wait here or return later.'
          : complete
            ? post.status === 'UNDER_REVIEW'
              ? post.canReview
                ? 'Review the saved poster and captions below, then approve or request changes.'
                : 'Ask an independent colleague to review the poster and captions together.'
              : post.status === 'APPROVED'
                ? 'This exact post revision is approved. Editing requires another review.'
                : 'Preview the poster and captions, then send the complete saved post for review.'
            : caption
              ? 'Your caption is saved. Prepare a poster for this wording, then send the complete post for review.'
              : 'Prepare an AI caption using approved brand guidance, choose a labeled template or write your caption. Then create the poster.';
  const plan = revision.creationPlan ?? defaultCreationPlan;
  const video = plan.format === 'VIDEO';
  const decision = post.events.findLast((event) =>
    ['APPROVE', 'REQUEST_CHANGES', 'REJECT'].includes(event.action),
  );
  const feedback = decision && decision.action !== 'APPROVE' ? (decision.comment ?? '') : '';
  const images = Array.isArray(revision.productSnapshot.images)
    ? revision.productSnapshot.images
    : [];
  const photo = images.find((item: unknown): item is { url: string } =>
    Boolean(item && typeof item === 'object' && 'url' in item && typeof item.url === 'string'),
  );
  return (
    <section
      aria-label="Post workspace"
      className="mx-auto min-w-0 max-w-6xl space-y-5 break-words pb-10"
    >
      <UnsavedPostGuard active={dirty || Boolean(comment.trim() && !action.isSuccess)} />
      <header>
        <Link className="text-sm underline" to="/posts">
          ← Posts
        </Link>
        <h1 ref={heading} tabIndex={-1} className="mt-2 font-serif text-3xl">
          {revision.productSnapshot.productName}
        </h1>
        <p role="status" className="mt-2 font-semibold">
          {postStatusLabel[post.status]} · Revision {post.revisionNumber}
        </p>
        <p className="mt-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-950">
          <strong>Next:</strong>{' '}
          {video
            ? 'Edit your saved video brief, or switch to a poster while video setup is unavailable.'
            : post.status === 'REJECTED'
              ? 'Read the review feedback and prepare a new version before submitting again.'
              : next}
        </p>
      </header>
      <section aria-label="Brand provenance" className="rounded border bg-white p-3 text-sm">
        {revision.brandSnapshot ? (
          <>
            <strong>
              Brand: {revision.brandSnapshot.name} · version {revision.brandSnapshot.versionNumber}
            </strong>
            <p>
              Selected caption examples: {revision.brandSnapshot.references.length}. Historical
              poster images were not sent to the image provider. Reference guidance is not training
              or fine-tuning.
            </p>
          </>
        ) : (
          <p>
            No approved visual brand pack is pinned to this revision. No historical poster
            references are claimed.
          </p>
        )}
      </section>
      <ProductEligibilityPanel
        postId={post.id}
        revision={post.revisionNumber}
        canEdit={post.canEdit && !dirty}
      />
      <PostJourney
        active={
          post.status === 'APPROVED'
            ? 4
            : ['UNDER_REVIEW', 'CHANGES_REQUESTED', 'REJECTED'].includes(post.status)
              ? 3
              : 2
        }
      />
      {feedback && post.status !== 'APPROVED' && (
        <section
          aria-label="Reviewer feedback"
          className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-950"
        >
          <h2 className="font-semibold">
            {post.status === 'REJECTED'
              ? 'This version was rejected'
              : 'Feedback from your reviewer'}
          </h2>
          <p className="mt-2 text-xs">
            Feedback on version{' '}
            {post.revisions.find((r) => r.id === decision?.revisionId)?.revisionNumber ?? 'earlier'}
          </p>
          <p className="mt-2 whitespace-pre-wrap">{feedback}</p>
          <p className="mt-2 text-sm">
            {post.canReview
              ? 'Check whether this revision addresses the earlier feedback before deciding.'
              : post.status === 'UNDER_REVIEW'
                ? 'The new version is waiting for independent review.'
                : 'Edit the caption or prepare another poster version, then send the complete post for a new review.'}
          </p>
        </section>
      )}
      {video && (
        <section
          aria-label="Video availability"
          className="rounded-xl border border-amber-200 bg-amber-50 p-5"
        >
          <h2 className="font-semibold">Your video brief is saved</h2>
          <p className="mt-2">
            Video generation through the application's Higgsfield MCP connection is not connected
            yet. There is no generated video, and no credits have been used for this brief. Video
            review and downloads are unavailable.
          </p>
          <p className="mt-2 text-sm">
            You can edit this brief or choose Poster + captions below. Ask your administrator to
            finish connecting video creation.
          </p>
        </section>
      )}
      {!video &&
        (post.canEdit ||
          (canManageBudget &&
            generation.data?.provider === 'higgsfield_mcp' &&
            generationStatus === 'AWAITING_CONFIRMATION')) &&
        post.status !== 'APPROVED' && (
          <>
            {post.canEdit && (
              <PostCaptionPanel
                onBusyChange={setCaptionBusy}
                onStatusChange={setCaptionState}
                id={post.id}
                revision={post.revisionNumber}
                disabled={dirty || Boolean(generationBusy)}
              />
            )}
            <PostGenerationPanel
              canPrepare={post.canEdit}
              hasSavedPoster={complete}
              hasSavedCaption={Boolean(caption)}
              id={post.id}
              revision={post.revisionNumber}
              disabled={dirty || captionBusy}
            />
          </>
        )}
      <section className="rounded-xl border bg-white p-4">
        <h2 className="text-lg font-semibold">Product and post details</h2>
        <p className="mt-2 text-sm text-neutral-600">
          {revision.creationPlan ? (
            <>
              {video ? 'Video brief' : 'Poster + captions'} · {purposeLabels[plan.purpose]} ·{' '}
              {styleLabels[plan.style]} style
            </>
          ) : (
            'Saved post · no content type or visual style was recorded for this older version.'
          )}
        </p>
        <div className="mt-3 flex gap-4">
          {photo && (
            <img
              src={
                photo.url.includes('.invalid')
                  ? `/assets/products/${encodeURIComponent(revision.productSnapshot.sku)}.png`
                  : photo.url
              }
              alt={revision.productSnapshot.productName}
              className="h-20 w-20 rounded-lg object-contain"
            />
          )}
          <div>
            <p>
              {revision.productSnapshot.brand} · {revision.productSnapshot.sku}
            </p>
            <p>
              {revision.productSnapshot.currency}{' '}
              {Number(revision.productSnapshot.price).toFixed(2)}
            </p>
            <p className="text-sm">
              Intended channel: {revision.channel} · {revision.language} · Campaign:{' '}
              {revision.campaignSnapshot?.name ?? revision.campaign?.name ?? 'None'}
            </p>
            <Link className="text-sm underline" to={`/products/${revision.productSnapshotId}`}>
              View catalog facts
            </Link>
          </div>
        </div>
        {revision.campaignSnapshot && (
          <div className="mt-3 text-sm">
            <p>Campaign code: {revision.campaignSnapshot.code}</p>
            <p>Objective: {revision.campaignSnapshot.objective}</p>
            {revision.campaignSnapshot.description && (
              <p className="whitespace-pre-wrap">{revision.campaignSnapshot.description}</p>
            )}
          </div>
        )}
        {revision.campaignId && !revision.campaignSnapshot && (
          <p className="text-sm">
            This older revision links to current campaign details. Save a new revision to capture
            its campaign context before final review.
          </p>
        )}
        <p className="mt-3 whitespace-pre-wrap text-sm">
          Brief: {revision.brief || 'No brief entered.'}
        </p>
      </section>
      {post.factualValidation && (
        <section className="rounded-xl border bg-white p-4" aria-label="Caption factual checks">
          <h2 className="font-semibold">
            Caption factual checks:{' '}
            {post.factualValidation.status === 'PASSED'
              ? 'Passed'
              : post.factualValidation.status === 'PASSED_WITH_WARNINGS'
                ? 'Review warnings'
                : 'Corrections needed'}
          </h2>
          <ul>
            {post.factualValidation.findings
              .filter((f) => f.code !== 'VALIDATION_COMPLETED')
              .map((f, i) => (
                <li key={i}>{f.message}</li>
              ))}
          </ul>
          <p className="text-sm">
            These checks run again before approval. Human review is still required.
          </p>
        </section>
      )}
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-xl border bg-white p-4">
          <h2 className="text-lg font-semibold">{video ? 'Video preview' : 'Poster'}</h2>
          {post.previewUrl && (
            <p className="mt-2 text-sm">
              {revision.generation
                ? revision.generation.provider === 'fake' ||
                  revision.generation.provenance?.kind === 'MOCK'
                  ? 'Mock poster — for testing only.'
                  : 'Generated background with the approved product photo. No historical poster references were used.'
                : revision.visualAsset?.provider.toLowerCase().includes('import')
                  ? 'Imported image — its original generation is not verified here.'
                  : revision.visualAsset?.provider.toLowerCase().includes('fake')
                    ? 'Mock image — for testing only.'
                    : 'Linked image from the existing poster tools. Its source and image references have not been verified in this workspace.'}
            </p>
          )}
          {post.previewUrl && !imageFailed ? (
            <img
              src={post.previewUrl}
              alt={`Saved poster for ${revision.productSnapshot.productName}`}
              className="mt-3 max-h-[600px] w-full object-contain"
              onLoad={() => setImageLoaded(true)}
              onError={() => {
                setImageFailed(true);
                setImageLoaded(false);
              }}
            />
          ) : (
            <p
              role={imageFailed ? 'alert' : 'status'}
              className="mt-3 rounded-lg border border-dashed p-6"
            >
              {imageFailed
                ? 'The saved poster could not be loaded. Try again; if it is still unavailable, ask an administrator to restore or rebuild it.'
                : video
                  ? 'No video has been generated for this brief.'
                  : 'No saved poster image is linked yet.'}
              {imageFailed && (
                <button
                  type="button"
                  className="mt-3 block min-h-11 rounded border px-4 underline"
                  onClick={() => {
                    setImageFailed(false);
                    setImageLoaded(false);
                  }}
                >
                  Try loading poster again
                </button>
              )}
            </p>
          )}
          {revision.posterVersion && (
            <p className="mt-3 text-sm">
              <Link
                className="underline"
                to={`/creative/projects/${revision.posterVersion.sceneId}`}
              >
                Open poster editor
              </Link>{' '}
              · Linked poster version {revision.posterVersion.versionNumber}
            </p>
          )}
        </section>
        <section aria-label="Saved caption" className="rounded-xl border bg-white p-4">
          <h2 className="text-lg font-semibold">Caption</h2>
          {revision.captionProvenance?.method && (
            <p className="text-sm">
              Source: {revision.captionProvenance.method.replaceAll('_', ' ')}
            </p>
          )}
          {caption ? (
            <div className="mt-3 space-y-3">
              <p className="font-semibold">{caption.headline}</p>
              {caption.english_caption && (
                <div>
                  <h3 className="text-sm font-semibold">English</h3>
                  <p className="whitespace-pre-wrap">{caption.english_caption}</p>
                </div>
              )}
              {caption.khmer_caption && (
                <div>
                  <h3 className="text-sm font-semibold">Khmer</h3>
                  <p className="whitespace-pre-wrap">{caption.khmer_caption}</p>
                </div>
              )}
              <p>{caption.cta}</p>
              <p className="text-sm">{caption.hashtags?.join(' ')}</p>
              {revision.generation && (
                <p className="text-sm">
                  {revision.captionDraft
                    ? 'Staff-edited captions'
                    : revision.generation.provenance?.captionMethod === 'staff-draft'
                      ? 'Staff-written captions'
                      : 'Catalog-based suggested captions'}{' '}
                  ·{' '}
                  {revision.generation.provider === 'fake' ||
                  revision.generation.provenance?.kind === 'MOCK'
                    ? 'Mock poster'
                    : 'AI background and authentic product composite'}{' '}
                  · No historical poster references.
                </p>
              )}
              {revision.captionVersion && (
                <Link
                  className="inline-block text-sm underline"
                  to={`/content/jobs/${revision.captionVersion!.contentJobId}`}
                >
                  View standalone caption history (separate workflow)
                </Link>
              )}
            </div>
          ) : (
            <p className="mt-3">
              No caption version is linked yet. Saving this post does not start AI generation.
            </p>
          )}
        </section>
      </div>
      {post.canEdit && !generationBusy && !editing && (
        <div className="flex flex-wrap gap-3">
          <button type="button" className={button} onClick={() => setEditing(true)}>
            {video
              ? 'Edit video brief'
              : complete
                ? 'Edit caption and details'
                : 'Edit brief and details'}
          </button>
          {complete && !video && (
            <a
              className="inline-flex min-h-11 items-center rounded-lg border px-4"
              href="#complete-post-review"
            >
              Continue to team review
            </a>
          )}
        </div>
      )}
      {post.canEdit &&
        (complete || post.status === 'REJECTED' || generationStatus === 'FAILED') &&
        !video &&
        !editing && (
          <PostVariationPanel post={post} disabled={generationBusy || dirty} feedback={feedback} />
        )}
      {post.canEdit && editing && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!generationBusy) save.mutate();
          }}
          className="space-y-4 rounded-xl border bg-white p-4"
        >
          <fieldset disabled={generationBusy || save.isPending} className="min-w-0 space-y-4">
            <h2 className="text-lg font-semibold">Edit saved draft</h2>
            <details className="rounded-lg border p-3">
              <summary className="min-h-11 cursor-pointer py-2 font-semibold">
                Change format, content type or style
              </summary>
              <p className="mb-3 text-sm">
                Changing these choices removes the poster from this new draft. Earlier versions are
                kept, and a new poster needs fresh cost confirmation.
              </p>{' '}
              <CreationChoices
                plan={form.creationPlan ?? defaultCreationPlan}
                onChange={(creationPlan) =>
                  update({
                    creationPlan,
                    generationId: null,
                    captionVersionId: null,
                    posterVersionId: null,
                    visualAssetId: null,
                  })
                }
              />
            </details>
            <label className="block" htmlFor="saved-brief">
              Brief
            </label>
            <textarea
              ref={editor}
              id="saved-brief"
              maxLength={2000}
              rows={3}
              value={form.brief}
              onChange={(e) => update({ brief: e.target.value })}
              className={inputClass}
            />
            {!form.captionDraft && (
              <button
                type="button"
                className={button}
                onClick={() =>
                  update({
                    captionDraft: {
                      headline: revision.productSnapshot.productName,
                      english_caption: form.language === 'KM' ? null : '',
                      khmer_caption: form.language === 'EN' ? null : '',
                      cta: 'Contact Parisian Shopper for details.',
                      hashtags: [],
                      creative_brief: form.brief || 'Product presentation',
                      facts_used: [],
                      warnings: [],
                      missing_information: [],
                    },
                  })
                }
              >
                Write captions for this draft
              </button>
            )}
            {form.captionDraft && (
              <fieldset className="space-y-3">
                <legend className="font-semibold">Edit the suggested captions</legend>
                <p className="text-sm">
                  Saving creates a new post revision. This does not change the words printed on the
                  saved poster or the original standalone caption. Review both before sending.
                </p>
                {(['headline', 'english_caption', 'khmer_caption', 'cta'] as const).map(
                  (field) =>
                    form.captionDraft?.[field] !== null && (
                      <label key={field} className="block">
                        {
                          {
                            headline: 'Caption heading',
                            english_caption: 'English caption',
                            khmer_caption: 'Khmer caption',
                            cta: 'Call to action',
                          }[field]
                        }
                        <textarea
                          aria-label={
                            {
                              headline: 'Caption heading',
                              english_caption: 'English caption',
                              khmer_caption: 'Khmer caption',
                              cta: 'Call to action',
                            }[field]
                          }
                          className={inputClass}
                          maxLength={field === 'headline' ? 300 : field === 'cta' ? 500 : 10000}
                          required
                          rows={field.includes('caption') ? 4 : 2}
                          value={form.captionDraft?.[field] ?? ''}
                          onChange={(e) =>
                            update({
                              captionDraft: { ...form.captionDraft!, [field]: e.target.value },
                            })
                          }
                        />
                      </label>
                    ),
                )}
                <label className="block">
                  Hashtags (separated by spaces)
                  <input
                    className={inputClass}
                    aria-label="Hashtags"
                    value={hashtagText}
                    onChange={(e) => {
                      setHashtagText(e.target.value);
                      setDirty(true);
                    }}
                  />
                </label>
              </fieldset>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <label>
                Channel
                <select
                  aria-label="Saved channel"
                  className={inputClass}
                  value={form.channel}
                  onChange={(e) =>
                    update({
                      channel: e.target.value as PostInput['channel'],
                      generationId: null,
                      captionDraft: null,
                      captionVersionId: null,
                      posterVersionId: null,
                      visualAssetId: null,
                    })
                  }
                >
                  {['FACEBOOK', 'INSTAGRAM', 'TELEGRAM', 'GENERIC'].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label>
                Language
                <select
                  aria-label="Saved language"
                  className={inputClass}
                  value={form.language}
                  onChange={(e) =>
                    update({
                      language: e.target.value as PostInput['language'],
                      generationId: null,
                      captionDraft: null,
                      captionVersionId: null,
                      posterVersionId: null,
                      visualAssetId: null,
                    })
                  }
                >
                  {['BILINGUAL', 'KM', 'EN'].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
            </div>
            <p className="text-sm text-app-muted">
              Save channel or language changes before choosing new matching versions. Selecting a
              different caption clears the linked poster and image.
            </p>
            {!revision.generationId && (
              <details>
                <summary className="min-h-11 cursor-pointer py-3 font-semibold">
                  Use existing work (optional)
                </summary>
                <div className="space-y-3">
                  {candidates.isLoading && (
                    <p role="status">Loading matching captions and posters…</p>
                  )}
                  {candidates.isError && (
                    <p role="alert">
                      Could not load matching work.{' '}
                      <button
                        type="button"
                        className="underline"
                        onClick={() => void candidates.refetch()}
                      >
                        Try again
                      </button>
                    </p>
                  )}
                  <label className="block">
                    Caption version
                    <select
                      aria-label="Caption version"
                      className={inputClass}
                      value={form.captionVersionId ?? ''}
                      onChange={(e) =>
                        update({
                          captionVersionId: e.target.value || null,
                          captionDraft: null,
                          generationId: null,
                          posterVersionId: null,
                          visualAssetId: null,
                        })
                      }
                    >
                      <option value="">No caption selected</option>
                      {revision.captionVersion &&
                        !candidates.data?.captions.some(
                          (c) => c.id === revision.captionVersionId,
                        ) && (
                          <option value={revision.captionVersionId!}>
                            Linked version {revision.captionVersion.versionNumber}
                          </option>
                        )}
                      {candidates.data?.captions.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.structuredOutput.headline || 'Caption'} · v{c.versionNumber} ·{' '}
                          {c.id.slice(0, 8)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    Poster version
                    <select
                      aria-label="Poster version"
                      className={inputClass}
                      value={form.posterVersionId ?? ''}
                      onChange={(e) =>
                        update({ posterVersionId: e.target.value || null, visualAssetId: null })
                      }
                    >
                      <option value="">No poster selected</option>
                      {candidates.data?.posters.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.scene.title} · v{p.versionNumber}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    Saved poster image
                    <select
                      aria-label="Saved poster image"
                      className={inputClass}
                      value={form.visualAssetId ?? ''}
                      onChange={(e) => update({ visualAssetId: e.target.value || null })}
                    >
                      <option value="">No saved image selected</option>
                      {chosenPoster?.renderedAssets.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.width} × {a.height} · {a.id.slice(0, 8)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className="text-sm">
                    Only images recorded as renders of the exact poster version can be linked. Older
                    images need a new render. The picker shows up to 100 matching versions.
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <Link className="text-sm underline" to="/content/new">
                      Standalone Caption tool
                    </Link>
                    <Link className="text-sm underline" to="/creative/new">
                      Standalone poster tool
                    </Link>
                  </div>
                </div>
              </details>
            )}
            <div className="flex flex-wrap gap-3">
              <button className={button} disabled={!dirty || save.isPending}>
                {save.isPending ? 'Saving…' : 'Save new revision'}
              </button>
              <button
                type="button"
                className="min-h-11 rounded-lg border px-4"
                disabled={save.isPending}
                onClick={() => {
                  setForm(initialForm);
                  setHashtagText(initialForm.captionDraft?.hashtags.join(' ') ?? '');
                  setDirty(false);
                  setEditing(false);
                }}
              >
                Cancel editing
              </button>
            </div>
            {save.isError && (
              <p role="alert" className="text-red-700">
                {save.error.message}
              </p>
            )}
          </fieldset>
        </form>
      )}
      <section id="complete-post-review" className="space-y-3 rounded-xl border bg-white p-4">
        <h2 className="text-lg font-semibold">Final review of the complete post</h2>
        <p className="text-sm">
          One decision covers the saved poster, captions, product facts, campaign and channel shown
          here. Sending for review places it in the web Reviews queue for an authorized colleague.
          It does not publish or send it to Telegram.
        </p>
        {post.status === 'UNDER_REVIEW' && (
          <p className="text-sm">
            Reviewing post revision {post.revisionNumber} · submission {post.reviewRound}
          </p>
        )}
        <p className="text-sm">
          The creator, requester and revision authors cannot approve their own work. A second
          account used by the same person is not an independent human review.
        </p>
        {post.canEdit && post.status !== 'APPROVED' && (
          <button
            className={button}
            disabled={
              generationBusy ||
              video ||
              post.status === 'REJECTED' ||
              !complete ||
              dirty ||
              action.isPending ||
              imageFailed ||
              Boolean(post.factualValidation?.blockingCount)
            }
            onClick={() => action.mutate('SUBMIT')}
          >
            Send complete post for review
          </button>
        )}
        {post.status === 'UNDER_REVIEW' && !post.canReview && (
          <p role="status" className="text-amber-900">
            {post.reviewReason} Ask a different authorized colleague to open this post.
          </p>
        )}
        {post.canReview && (
          <div className="space-y-3">
            <label htmlFor="post-review-comment" className="block">
              Review note (required for changes or rejection)
            </label>
            <textarea
              id="post-review-comment"
              maxLength={1000}
              className={inputClass}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
            <div className="flex flex-wrap gap-3">
              <button
                className={button}
                disabled={
                  action.isPending ||
                  !post.previewUrl ||
                  imageFailed ||
                  !imageLoaded ||
                  Boolean(post.factualValidation?.blockingCount)
                }
                onClick={() => action.mutate('APPROVE')}
              >
                Approve this post revision
              </button>
              <button
                className={button}
                disabled={action.isPending || comment.trim().length < 3}
                onClick={() => action.mutate('REQUEST_CHANGES')}
              >
                Request changes
              </button>
              <button
                className="min-h-11 rounded-lg border border-red-300 px-4 text-red-800 disabled:opacity-40"
                disabled={action.isPending || comment.trim().length < 3}
                onClick={() => action.mutate('REJECT')}
              >
                Reject this version
              </button>
            </div>
          </div>
        )}
        {action.isError && (
          <p role="alert" className="text-red-700">
            {action.error.message}{' '}
            <button
              type="button"
              className="underline"
              onClick={() => {
                void cache.invalidateQueries({ queryKey: ['staff-post', post.id] });
                action.reset();
              }}
            >
              Refresh saved post
            </button>
          </p>
        )}
        {action.isSuccess && (
          <p role="status">
            {post.status === 'APPROVED'
              ? 'This complete post revision is approved.'
              : post.status === 'REJECTED'
                ? 'This version was rejected. Its history is kept; the creator can prepare a new version.'
                : post.status === 'CHANGES_REQUESTED'
                  ? 'Feedback saved. The creator can now edit and resubmit.'
                  : 'The complete post is waiting for independent review.'}
          </p>
        )}
        {post.status === 'APPROVED' && (
          <p className="text-sm">
            Approved for this exact revision. Editing creates a new draft requiring revalidation and
            independent review.
          </p>
        )}
      </section>
      {post.status === 'APPROVED' ? (
        <ApprovedPostActions post={post} dirty={dirty} />
      ) : (
        <details className="rounded-xl border bg-white p-4">
          <summary className="min-h-11 cursor-pointer py-2 font-semibold">
            Download &amp; share — available after approval
          </summary>
          <ApprovedPostActions post={post} dirty={dirty} />
        </details>
      )}
      <section className="rounded-xl border bg-white p-4">
        <h2 className="text-lg font-semibold">History</h2>
        <details>
          <summary className="min-h-11 cursor-pointer py-3">View activity and decisions</summary>
          <ol className="mt-3 space-y-2 text-sm">
            {post.events.map((event) => (
              <li key={event.id}>
                {event.action.replaceAll('_', ' ')}
                {event.reviewRound != null ? ` · submission ${event.reviewRound}` : ''} ·{' '}
                {event.actor.displayName} · {new Date(event.createdAt).toLocaleString()}
                {event.comment && <p className="whitespace-pre-wrap">{event.comment}</p>}
              </li>
            ))}
          </ol>
        </details>
        <details className="mt-4">
          <summary className="cursor-pointer">Saved revisions ({post.revisions.length})</summary>
          <ul className="mt-2 space-y-2 text-sm">
            {post.revisions.map((r) => {
              const savedCaption =
                r.captionDraft ?? r.generation?.caption ?? r.captionVersion?.structuredOutput;
              return (
                <li key={r.id} className="rounded border p-3">
                  <p>
                    Revision {r.revisionNumber} · {r.author.displayName} ·{' '}
                    {new Date(r.createdAt).toLocaleString()}
                  </p>
                  <p>
                    {r.productSnapshot.productName} · {r.productSnapshot.currency}{' '}
                    {Number(r.productSnapshot.price).toFixed(2)} · {r.channel} · {r.language} ·{' '}
                    {r.campaignSnapshot?.name ?? r.campaign?.name ?? 'No campaign'}
                  </p>
                  {r.generation?.status === 'COMPLETE' || r.visualAssetId ? (
                    <a
                      className="underline"
                      href={`/v1/posts/${post.id}/image?revisionId=${r.id}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      View poster saved with revision {r.revisionNumber}
                    </a>
                  ) : (
                    <p>No saved poster in this revision.</p>
                  )}
                  {savedCaption && (
                    <details className="mt-2">
                      <summary className="cursor-pointer">View the exact saved captions</summary>
                      <p className="font-semibold">{savedCaption.headline}</p>
                      <p className="whitespace-pre-wrap">{savedCaption.english_caption}</p>
                      <p className="whitespace-pre-wrap">{savedCaption.khmer_caption}</p>
                      <p>{savedCaption.cta}</p>
                      <p>{savedCaption.hashtags.join(' ')}</p>
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
        </details>
      </section>
    </section>
  );
}
