import { ProductEligibilityPanel } from '../components/ProductEligibilityPanel.js';
import { CreationChoices, defaultCreationPlan } from '../components/CreationChoices.js';
import { PostJourney } from '../components/PostJourney.js';
import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { UnsavedPostGuard } from '../UnsavedPostGuard.js';
import { ProductContextSelector } from '../../content/components/ProductContextSelector.js';
import { useCreatePost } from '../use-posts.js';
import { useCampaigns } from '../../campaigns/hooks/use-campaigns.js';
import { useProductDetail } from '../../products/hooks/use-products.js';
import type { ProductSummary } from '../../products/types/product.types.js';
import type { ContentLanguage, ContentPlatform } from '../../content/types/content.types.js';

const input =
  'w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-neutral-900 focus-visible:outline-2 focus-visible:outline-amber-700';
const button =
  'inline-flex min-h-11 items-center justify-center rounded-lg bg-[#20313d] px-5 py-2 text-sm font-semibold text-white disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700';

export function CreatePostPage(): React.JSX.Element {
  const navigate = useNavigate();
  const [saved, setSaved] = useState(false);
  const savedNow = useRef(false);
  const requestKey = useRef(crypto.randomUUID());
  const heading = useRef<HTMLHeadingElement>(null);
  const [step, setStep] = useState<1 | 2>(1);
  const [product, setProduct] = useState<ProductSummary | null>(null);
  const [brief, setBrief] = useState('');
  const [creationPlan, setCreationPlan] = useState(defaultCreationPlan);
  const [platform, setPlatform] = useState<ContentPlatform>('FACEBOOK');
  const [language, setLanguage] = useState<ContentLanguage>('BILINGUAL');
  const [campaign, setCampaign] = useState('');
  const details = useProductDetail(product?.id);
  const campaigns = useCampaigns({ limit: 50 });
  const create = useCreatePost();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!product || create.isPending) return;
    try {
      const job = await create.mutateAsync({
        requestKey: `web:${requestKey.current}`,
        creationPlan,
        productSnapshotId: product.id,
        language,
        channel: platform,
        brief: brief.trim(),
        ...(campaign ? { campaignId: campaign } : {}),
      });
      savedNow.current = true;
      setSaved(true);
      setTimeout(() => navigate(`/posts/${job.id}`), 0);
    } catch {
      /* Display the error below and preserve the form. */
    }
  }

  useEffect(() => {
    heading.current?.focus();
  }, [step]);
  return (
    <section aria-label="Create a post" className="mx-auto max-w-5xl space-y-6 pb-10">
      <UnsavedPostGuard active={Boolean(product) && !saved && !savedNow.current} />
      <header>
        <p className="text-sm text-amber-800">Create a post · Step {step} of 5</p>
        <h1 ref={heading} tabIndex={-1} className="mt-1 font-serif text-3xl text-[#20313d]">
          {step === 1 ? 'Choose a product' : 'Plan your content'}
        </h1>
        <p className="mt-2 text-sm text-neutral-600">
          Choose your product, create its poster and captions, then ask a colleague to review the
          complete post.
        </p>
      </header>
      <PostJourney active={step - 1} />
      {step === 1 ? (
        <section className="space-y-4 rounded-2xl border bg-white p-5 sm:p-6">
          <h2 className="text-lg font-semibold">Select the product to feature</h2>
          <ProductContextSelector selectedSnapshotId={product?.id ?? null} onSelect={setProduct} />
          {product && (
            <div className="rounded-xl bg-neutral-50 p-4 text-sm">
              <h3 className="font-semibold">Selected: {product.title}</h3>
              <p>
                {product.brand} · {product.sku} · {product.price.currency}{' '}
                {product.price.amount.toFixed(2)}
              </p>
              <p>{product.category}</p>
              {details.data?.description && <p className="mt-2">{details.data.description}</p>}
              <p className="mt-2 text-neutral-500">
                These details come from the product catalog.{' '}
                <Link className="underline" to={`/products/${product.id}`}>
                  View product facts
                </Link>
              </p>
            </div>
          )}
          <button type="button" className={button} disabled={!product} onClick={() => setStep(2)}>
            Continue to post details
          </button>
        </section>
      ) : (
        <form
          onSubmit={(e) => void submit(e)}
          className="space-y-5 rounded-2xl border bg-white p-5 sm:p-6"
        >
          <div className="flex flex-wrap items-center gap-4 rounded-xl bg-neutral-50 p-4">
            {product?.primaryImageUrl && (
              <img
                className="h-20 w-20 rounded-lg bg-white object-contain"
                alt={product.title}
                src={
                  product.primaryImageUrl.includes('.invalid')
                    ? `/assets/products/${encodeURIComponent(product.sku)}.png`
                    : product.primaryImageUrl
                }
              />
            )}
            <div className="min-w-0 flex-1">
              <span className="block text-xs uppercase tracking-wide text-neutral-500">
                Selected product
              </span>
              <strong className="block text-lg">{product?.title}</strong>
              <span className="text-sm">
                {product?.brand} · {product?.sku} · {product?.price.currency}{' '}
                {product?.price.amount.toFixed(2)}
              </span>
            </div>
            <button
              type="button"
              className="min-h-11 rounded-lg border bg-white px-4 text-sm"
              onClick={() => setStep(1)}
            >
              Choose another product
            </button>
          </div>
          {product && (
            <ProductEligibilityPanel
              preview={{
                snapshotId: product.id,
                creationPlan,
                brief,
                ...(campaign ? { campaignId: campaign } : {}),
              }}
            />
          )}
          <CreationChoices plan={creationPlan} onChange={setCreationPlan} />
          <div>
            <label className="mb-1 block font-semibold" htmlFor="post-brief">
              What would you like to share? <span className="font-normal">(optional)</span>
            </label>
            <textarea
              id="post-brief"
              className={input}
              rows={4}
              maxLength={2000}
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              placeholder="For example: Introduce this fragrance as a gift for Mother's Day."
            />
            <button
              type="button"
              className="my-2 min-h-11 rounded-lg border px-4 text-sm"
              onClick={() =>
                setBrief(
                  `Introduce ${product?.title ?? 'the selected product'} in a ${creationPlan.style.toLowerCase()} ${creationPlan.format === 'VIDEO' ? 'video concept' : 'product poster'}. Use only verified catalog facts and preserve the approved product image. Suggest natural Khmer and English captions with an invitation to contact Parisian Shopper. Do not invent discounts, stock availability, fragrance notes or performance claims.`,
                )
              }
            >
              Use a suggested brief
            </button>
            <p className="mt-1 text-sm text-neutral-600">
              Use verified facts only. The caption will be checked before review.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="post-channel" className="mb-1 block font-semibold">
                Channel
              </label>
              <select
                id="post-channel"
                className={input}
                value={platform}
                onChange={(e) => setPlatform(e.target.value as ContentPlatform)}
              >
                <option value="FACEBOOK">Facebook</option>
                <option value="INSTAGRAM">Instagram</option>
                <option value="TELEGRAM">Telegram</option>
                <option value="GENERIC">Other / multiple channels</option>
              </select>
            </div>
            <div>
              <label htmlFor="post-language" className="mb-1 block font-semibold">
                Caption language
              </label>
              <select
                id="post-language"
                className={input}
                value={language}
                onChange={(e) => setLanguage(e.target.value as ContentLanguage)}
              >
                <option value="BILINGUAL">Khmer and English</option>
                <option value="KM">Khmer</option>
                <option value="EN">English</option>
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="post-campaign" className="mb-1 block font-semibold">
              Campaign (optional)
            </label>
            <select
              id="post-campaign"
              className={input}
              value={campaign}
              onChange={(e) => setCampaign(e.target.value)}
            >
              <option value="">No campaign</option>
              {campaigns.data?.items.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} — {c.code} ({c.status})
                </option>
              ))}
            </select>
            {campaigns.isError && (
              <p role="alert" className="mt-1 text-sm text-red-700">
                Campaigns could not be loaded. You can continue without one.
              </p>
            )}
          </div>
          <div className="rounded-lg bg-amber-50 p-4 text-sm text-amber-950">
            <strong>What happens next:</strong>{' '}
            {creationPlan.format === 'VIDEO'
              ? 'Save your video brief. Video generation is not connected yet.'
              : 'Save these details, then prepare the poster and captions in one workspace. Higgsfield requires an exact cost confirmation before generation.'}{' '}
            Saving this draft does not start AI generation or use credits.
          </div>
          {create.isError && (
            <p role="alert" className="text-sm text-red-700">
              Could not save the post. {create.error.message} Please try again.
            </p>
          )}
          <button className={button} disabled={create.isPending}>
            {create.isPending ? 'Saving draft…' : 'Save post draft'}
          </button>
        </form>
      )}
    </section>
  );
}
