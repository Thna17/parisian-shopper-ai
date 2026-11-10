import { useEffect, useState, useRef, type JSX, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { apiClient } from '../../../services/api/api-client.js';
type Layout = {
  templateId: string;
  textColor: string;
  accentColor: string;
  panelBackground: string;
  productPlacement: string;
  textPlacement: string;
};
type Guidance = {
  formality: string;
  capitalization: string;
  emojiLimit: number | string;
  name: string;
  tone: string;
  khmerTone: string;
  terminology: { english: string; khmer: string }[];
  ctaEnglish: string;
  ctaKhmer: string;
  contact: string;
  claimsRestrictions: string[];
  colors: string[];
  headlineFont: string;
  khmerFont: string;
  englishFont: string;
  logoSourceId: string | null;
  textOnlyBrandName: string;
  channels: Record<string, Layout>;
  lighting: string;
  referenceSourceIds: string[];
  captionRules: unknown;
};
type Profile = {
  id: string;
  name: string;
  versionNumber: number;
  status: string;
  digest: string;
  approvalId: string | null;
  guidance: Guidance;
  benchmarkReport: null | { passed?: boolean; overallScore?: number };
  ruleVersionId: string;
  datasetVersionId: string;
};
type Reference = {
  id: string;
  sourceUrl: string | null;
  sourceSystem: string;
  captionText: string;
  copyrightDeclared: boolean;
  copyrightOwner: string;
  licenseReference: string;
  tags: string[];
  mediaCasKeys: string[];
  version: number;
  status: string;
  sourceDigest: string;
  reviewEventId?: string | null;
  reviewHistory?: {
    id: string;
    decision: string;
    notes: string;
    actorUserId: string;
    createdAt: string;
  }[];
  history: { id: string; version: number }[];
};
const button =
  'rounded-lg border px-4 py-2 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700';
const input = 'block w-full rounded-lg border p-2';
const blank = (): Guidance => ({
  formality: '',
  capitalization: '',
  emojiLimit: '',
  name: '',
  tone: '',
  khmerTone: '',
  terminology: [],
  ctaEnglish: '',
  ctaKhmer: '',
  contact: '',
  claimsRestrictions: [],
  colors: [],
  headlineFont: 'Playfair Display',
  khmerFont: 'Noto Sans Khmer',
  englishFont: 'Montserrat',
  logoSourceId: null,
  textOnlyBrandName: '',
  channels: {},
  lighting: '',
  referenceSourceIds: [],
  captionRules: {},
});
export function BrandGuidancePage(): JSX.Element {
  const [profiles, setProfiles] = useState<Profile[]>([]),
    [refs, setRefs] = useState<Reference[]>([]),
    [selected, setSelected] = useState<Profile | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true);
  const [form, setForm] = useState(blank),
    [terms, setTerms] = useState(''),
    [colors, setColors] = useState(''),
    [claims, setClaims] = useState(''),
    [open, setOpen] = useState(false),
    [confirmed, setConfirmed] = useState(false);
  const [source, setSource] = useState({
      sourceSystem: 'CAMPAIGN_COLLATERAL',
      sourceUrl: '',
      captionText: '',
      copyrightDeclared: false,
      copyrightOwner: '',
      licenseReference: '',
      tags: '',
    }),
    [keys, setKeys] = useState<string[]>([]),
    [previous, setPrevious] = useState<string | undefined>(),
    [notes, setNotes] = useState<Record<string, string>>({}),
    [rights, setRights] = useState<Record<string, boolean>>({});
  const draftForm = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (open) draftForm.current?.querySelector<HTMLElement>('select,input,textarea')?.focus();
  }, [open]);
  async function load() {
    setConfirmed(false);
    setLoading(true);
    try {
      const [p, r] = await Promise.all([
        apiClient.get<Profile[]>('/v1/brand/guidance'),
        apiClient.get<Reference[]>('/v1/brand/guidance/references'),
      ]);
      setProfiles(p);
      setRefs(r);
      setSelected((current) => p.find((x) => x.id === current?.id) ?? p[0] ?? null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function run(task: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try {
      await task();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function fromProfile(p: Profile | null) {
    const g = p ? structuredClone(p.guidance) : blank();
    setForm(g);
    setTerms(g.terminology.map((t) => `${t.english} | ${t.khmer}`).join('\n'));
    setColors(g.colors.join(', '));
    setClaims(g.claimsRestrictions.join('\n'));
    setConfirmed(false);
    setOpen(true);
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    const termPairs = terms
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [english = '', ...khmer] = line.split('|');
        return { english: english.trim(), khmer: khmer.join('|').trim() };
      });
    const restrictions = claims
      .split('\n')
      .map((x) => x.trim())
      .filter(Boolean);
    const data = {
      ...form,
      emojiLimit: Number(form.emojiLimit),
      terminology: termPairs,
      colors: colors
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean),
      claimsRestrictions: restrictions,
      captionRules: {
        language: [form.khmerTone, ...termPairs.map((t) => `${t.english}: ${t.khmer}`)],
        tone: [
          form.tone,
          `Emoji limit: ${form.emojiLimit}`,
          `Capitalization: ${form.capitalization}`,
          `Formality: ${form.formality}`,
        ],
        cta: [form.ctaEnglish, form.ctaKhmer, `Contact: ${form.contact}`],
        promotion: restrictions,
        perfumeClaims: restrictions,
        platforms: Object.fromEntries(
          ['FACEBOOK', 'INSTAGRAM', 'TELEGRAM', 'GENERIC'].map((c) => [
            c,
            form.channels[c]
              ? [`Use the approved ${c} layout and readable caption length.`]
              : ['This channel is not configured in this profile.'],
          ]),
        ),
        visualGuidance: [form.lighting, `Business palette: ${colors}`],
      },
    };
    await run(async () => {
      const p = await apiClient.post<Profile>('/v1/brand/guidance', { data });
      setSelected(p);
      setOpen(false);
    });
  }
  async function upload(file: File | undefined) {
    if (!file) return;
    if (file.size > 512000) {
      setError('Choose an image up to 500 KB.');
      return;
    }
    await run(async () => {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const media = await apiClient.post<{ storageKey: string }>('/v1/brand/guidance/media', {
        base64,
        mimeType: file.type,
      });
      setKeys([media.storageKey]);
    });
  }
  function reviseSource(r: Reference) {
    setSource({
      sourceSystem: r.sourceSystem,
      sourceUrl: r.sourceUrl ?? '',
      captionText: r.captionText,
      copyrightDeclared: false,
      copyrightOwner: r.copyrightOwner,
      licenseReference: r.licenseReference,
      tags: r.tags.join(', '),
    });
    setKeys(r.mediaCasKeys);
    setPrevious(r.id);
  }
  const approved = refs.filter((r) => r.status === 'APPROVED');
  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 text-neutral-900">
      <header>
        <h1 className="text-3xl font-semibold">Brand guidance and references</h1>
        <p>
          Business-provided rules become usable only after explicit review. Saving a draft or
          importing a Facebook photo does not approve it.
        </p>
        <p className="mt-2">
          <Link className="underline" to="/brand/profile">
            Profile history
          </Link>{' '}
          ·{' '}
          <Link className="underline" to="/brand/benchmarks">
            Benchmark lab
          </Link>{' '}
          ·{' '}
          <Link className="underline" to="/brand/datasets">
            Reference collections and datasets
          </Link>
        </p>
      </header>
      {error && (
        <p role="alert" className="rounded border border-red-400 p-3">
          {error}
        </p>
      )}
      {loading && <p role="status">Loading brand versions…</p>}
      {busy && !loading && <p role="status">Saving and checking your changes…</p>}
      {!profiles.some((p) => p.status === 'ACTIVE' && p.approvalId) && (
        <p className="rounded bg-amber-50 p-4">
          No business-approved brand pack is available. Complete a draft, review its assets and
          approve that exact version. Existing legacy activation is not approval of this pack.
        </p>
      )}
      <section className="space-y-3 rounded-xl border bg-white p-4">
        <h2 className="text-xl font-semibold">1. Brand versions</h2>
        <div className="flex flex-wrap gap-3">
          <button className={button} disabled={busy} onClick={() => fromProfile(null)}>
            Create brand draft
          </button>
          <button
            className={button}
            disabled={busy || !selected}
            onClick={() => fromProfile(selected)}
          >
            Create next version from selected
          </button>
        </div>
        <label>
          Version to preview
          <select
            className={input}
            value={selected?.id ?? ''}
            onChange={(e) => {
              setSelected(profiles.find((p) => p.id === e.target.value) ?? null);
              setConfirmed(false);
            }}
          >
            <option value="">Select a version</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · v{p.versionNumber} · {p.status}
              </option>
            ))}
          </select>
        </label>
        {selected && (
          <div aria-label="Brand approval preview" className="space-y-3 rounded border p-4">
            <h3 className="font-semibold">
              {selected.name} · version {selected.versionNumber}
            </h3>
            <p>
              Status: {selected.status} ·{' '}
              {selected.approvalId ? 'Business approval recorded' : 'Not business-approved'}
            </p>
            <p>English tone: {selected.guidance.tone}</p>
            <p>
              Formality: {selected.guidance.formality}; capitalization:{' '}
              {selected.guidance.capitalization}; emoji limit: {selected.guidance.emojiLimit}.
            </p>
            <p>
              Supported composition uses fixed top-left logo placement, uploaded logo colors and 1.4
              minimum line spacing. These are software layout constraints; do not approve this
              version if unsuitable.
            </p>
            <p>Khmer guidance: {selected.guidance.khmerTone}</p>
            <p>
              Fonts: {selected.guidance.headlineFont}, {selected.guidance.khmerFont},{' '}
              {selected.guidance.englishFont}. Only these installed fonts are currently supported.
            </p>
            <div className="flex gap-2">
              {selected.guidance.colors.map((c) => (
                <span
                  key={c}
                  className="rounded border p-2"
                  style={{ borderTop: `12px solid ${c}` }}
                >
                  {c}
                </span>
              ))}
            </div>
            <p>
              CTA: {selected.guidance.ctaEnglish} / {selected.guidance.ctaKhmer}
            </p>
            <p>Contact: {selected.guidance.contact}</p>
            <p>
              Terminology:{' '}
              {selected.guidance.terminology.map((t) => `${t.english} → ${t.khmer}`).join('; ') ||
                'No terminology entries supplied.'}
            </p>
            <details>
              <summary>Exact caption rules included in this approval</summary>
              <pre className="whitespace-pre-wrap break-words text-xs">
                {JSON.stringify(selected.guidance.captionRules, null, 2)}
              </pre>
            </details>
            <p>Claims restrictions: {selected.guidance.claimsRestrictions.join('; ')}</p>
            <p>Lighting: {selected.guidance.lighting}</p>
            <p>
              Logo:{' '}
              {selected.guidance.logoSourceId
                ? 'Reviewed uploaded image'
                : `Explicit text-only branding: ${selected.guidance.textOnlyBrandName}`}
            </p>
            {selected.guidance.logoSourceId && (
              <img
                className="max-h-24"
                alt="Selected business logo"
                src={`/v1/brand/guidance/references/${selected.guidance.logoSourceId}/image/0`}
              />
            )}
            <div className="flex flex-wrap gap-3">
              {Object.entries(selected.guidance.channels).map(([channel, layout]) => (
                <div
                  key={channel}
                  className="w-56 rounded border p-4"
                  style={{ background: layout.panelBackground, color: layout.textColor }}
                >
                  <strong>{channel}</strong>
                  <p>{layout.templateId.replaceAll('_', ' ')}</p>
                  <p style={{ color: layout.accentColor }}>
                    {selected.guidance.textOnlyBrandName || selected.name}
                  </p>
                  <p>Actual product photo and saved caption are added when preparing a post.</p>
                </div>
              ))}
            </div>
            <p>
              Selected reference versions: {selected.guidance.referenceSourceIds.length}. The poster
              provider currently receives no reference images; selected caption text examples may
              guide caption style. This is reference-guided generation, not training or fine-tuning.
            </p>
            <div className="flex flex-wrap gap-2">
              {selected.guidance.referenceSourceIds.map((id) => (
                <figure key={id}>
                  <img
                    className="h-24 w-24 object-contain"
                    alt="Historical poster selected for review"
                    src={`/v1/brand/guidance/references/${id}/image/0`}
                  />
                  <figcaption>
                    {refs.find((r) => r.id === id)?.status ?? 'Missing'} · v
                    {refs.find((r) => r.id === id)?.version ?? '?'}
                  </figcaption>
                </figure>
              ))}
            </div>
            <p>
              Automated benchmark:{' '}
              {selected.benchmarkReport
                ? `${selected.benchmarkReport.passed ? 'Passed' : 'Needs attention'} · score ${selected.benchmarkReport.overallScore ?? 'unknown'}`
                : 'Not run. Use Benchmark lab before deciding if it is useful for your review.'}{' '}
              Scores are supporting evidence, not business approval or Khmer-quality proof.
            </p>
            {!selected.approvalId && (
              <>
                <label className="flex gap-2">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                  />
                  I reviewed this exact guidance, channel previews, source permissions and available
                  benchmark results on behalf of the business.
                </label>
                <button
                  className={button}
                  disabled={busy || !confirmed}
                  onClick={() =>
                    void run(() =>
                      apiClient.post(`/v1/brand/guidance/${selected.id}/approve`, {
                        digest: selected.digest,
                        confirmed: true,
                      }),
                    )
                  }
                >
                  Approve this brand version
                </button>
              </>
            )}
          </div>
        )}
      </section>
      {open && (
        <form
          onSubmit={(e) => void save(e)}
          className="space-y-3 rounded-xl border bg-white p-4"
          ref={draftForm}
          aria-label="Brand draft form"
        >
          <h2 className="text-xl font-semibold">Business guidance draft</h2>
          <label className="block">
            Formality
            <select
              required
              className={input}
              value={form.formality}
              onChange={(e) => setForm({ ...form, formality: e.target.value })}
            >
              <option value="">Choose business preference</option>
              {['LUXURY_FORMAL', 'ELEVATED_CASUAL', 'EDITORIAL'].map((v) => (
                <option key={v} value={v}>
                  {v.replaceAll('_', ' ')}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            English capitalization
            <select
              required
              className={input}
              value={form.capitalization}
              onChange={(e) => setForm({ ...form, capitalization: e.target.value })}
            >
              <option value="">Choose business preference</option>
              {['SENTENCE_CASE', 'TITLE_CASE', 'MINIMAL'].map((v) => (
                <option key={v} value={v}>
                  {v.replaceAll('_', ' ')}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            Maximum emojis per caption
            <input
              required
              type="number"
              min="0"
              max="10"
              className={input}
              value={form.emojiLimit}
              onChange={(e) => setForm({ ...form, emojiLimit: e.target.value })}
            />
          </label>
          <p>
            Enter actual business decisions. No official palette, tone, contact details or rights
            are filled in for you. Reusing a version creates a new draft; old versions stay
            unchanged.
          </p>
          {(
            [
              'name',
              'tone',
              'khmerTone',
              'ctaEnglish',
              'ctaKhmer',
              'contact',
              'lighting',
              'textOnlyBrandName',
            ] as const
          ).map((key) => (
            <label className="block" key={key}>
              {
                {
                  name: 'Profile name',
                  tone: 'English tone',
                  khmerTone: 'Khmer tone and spacing',
                  ctaEnglish: 'English CTA (up to 28 characters)',
                  ctaKhmer: 'Khmer CTA (up to 28 characters)',
                  contact: 'Approved store contact details',
                  lighting: 'Visual lighting guidance',
                  textOnlyBrandName: 'Text-only brand name (required if no logo)',
                }[key]
              }
              <input
                className={input}
                required={key !== 'textOnlyBrandName'}
                value={form[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              />
            </label>
          ))}
          <label className="block">
            Business colors (comma-separated hex values)
            <input
              className={input}
              required
              value={colors}
              onChange={(e) => setColors(e.target.value)}
              placeholder="#RRGGBB, #RRGGBB"
            />
          </label>
          <label className="block">
            Approved terminology (one English | Khmer pair per line)
            <textarea className={input} value={terms} onChange={(e) => setTerms(e.target.value)} />
          </label>
          <label className="block">
            Claims restrictions (one per line)
            <textarea
              className={input}
              required
              value={claims}
              onChange={(e) => setClaims(e.target.value)}
            />
          </label>
          <p>
            Installed fonts: Playfair Display for headlines, Noto Sans Khmer for Khmer, Montserrat
            for English. If your approved fonts differ, arrange font support before using this
            workflow.
          </p>
          <label className="block">
            Approved PNG logo
            <select
              className={input}
              value={form.logoSourceId ?? ''}
              onChange={(e) => setForm({ ...form, logoSourceId: e.target.value || null })}
            >
              <option value="">Use explicit text-only branding</option>
              {approved
                .filter((r) => r.tags.includes('logo'))
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.captionText.slice(0, 60)} · v{r.version}
                  </option>
                ))}
            </select>
          </label>
          {['FACEBOOK', 'INSTAGRAM', 'TELEGRAM', 'GENERIC'].map((channel) => (
            <fieldset key={channel} className="rounded border p-3">
              <legend>
                <label>
                  <input
                    type="checkbox"
                    checked={Boolean(form.channels[channel])}
                    onChange={(e) => {
                      const channels = { ...form.channels };
                      if (e.target.checked)
                        channels[channel] = {
                          templateId: 'EDITORIAL_SPLIT',
                          textColor: '',
                          accentColor: '',
                          panelBackground: '',
                          productPlacement: 'RIGHT',
                          textPlacement: 'LEFT',
                        };
                      else delete channels[channel];
                      setForm({ ...form, channels });
                    }}
                  />{' '}
                  Configure {channel}
                </label>
              </legend>
              {form.channels[channel] && (
                <>
                  <label>
                    Layout
                    <select
                      className={input}
                      value={form.channels[channel]!.templateId}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          channels: {
                            ...form.channels,
                            [channel]: { ...form.channels[channel]!, templateId: e.target.value },
                          },
                        })
                      }
                    >
                      {['EDITORIAL_SPLIT', 'CENTERED_HERO', 'SCENT_STORY', 'KHMER_SEASONAL'].map(
                        (t) => (
                          <option key={t} value={t}>
                            {t.replaceAll('_', ' ')}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                  {(['textColor', 'accentColor', 'panelBackground'] as const).map((field) => (
                    <label className="block" key={field}>
                      {field}
                      <input
                        className={input}
                        required
                        placeholder="#RRGGBB"
                        value={form.channels[channel]![field]}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            channels: {
                              ...form.channels,
                              [channel]: { ...form.channels[channel]!, [field]: e.target.value },
                            },
                          })
                        }
                      />
                    </label>
                  ))}
                </>
              )}
            </fieldset>
          ))}
          <fieldset>
            <legend>
              Approved caption-style examples (image pixels are not sent to the poster provider)
            </legend>
            {approved
              .filter((r) => !r.tags.includes('logo'))
              .map((r) => (
                <label className="block" key={r.id}>
                  <input
                    type="checkbox"
                    checked={form.referenceSourceIds.includes(r.id)}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        referenceSourceIds: e.target.checked
                          ? [...form.referenceSourceIds, r.id]
                          : form.referenceSourceIds.filter((id) => id !== r.id),
                      })
                    }
                  />
                  {r.captionText.slice(0, 80)} · v{r.version}
                </label>
              ))}
          </fieldset>
          <button className={button} disabled={busy}>
            Save new draft version
          </button>
          <button type="button" className={button} onClick={() => setOpen(false)}>
            Cancel
          </button>
        </form>
      )}
      <section className="space-y-3 rounded-xl border bg-white p-4">
        <h2 className="text-xl font-semibold">2. Reviewed reference library</h2>
        <p>
          Upload actual files and record their original source. Copyright declarations are not
          approval. Historical versions and review decisions are retained; nothing is scraped or
          approved automatically.
        </p>
        <form
          aria-label="Reference import"
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await apiClient.post('/v1/brand/guidance/references', {
                data: {
                  ...source,
                  tags: source.tags
                    .split(',')
                    .map((t) => t.trim())
                    .filter(Boolean),
                  mediaCasKeys: keys,
                  ...(previous ? { previousSourceId: previous } : {}),
                },
              });
              setKeys([]);
              setPrevious(undefined);
            });
          }}
        >
          <h3>
            {previous
              ? 'Save a new version of the selected reference'
              : 'Add a reference for review'}
          </h3>
          <label>
            Source
            <select
              className={input}
              value={source.sourceSystem}
              onChange={(e) => setSource({ ...source, sourceSystem: e.target.value })}
            >
              {['CAMPAIGN_COLLATERAL', 'BRAND_GUIDELINES', 'FACEBOOK', 'INSTAGRAM'].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          {(
            ['sourceUrl', 'captionText', 'copyrightOwner', 'licenseReference', 'tags'] as const
          ).map((k) => (
            <label className="block" key={k}>
              {
                {
                  sourceUrl: 'Original source or internal document URL',
                  captionText: 'Caption or description',
                  copyrightOwner: 'Copyright owner',
                  licenseReference: 'License or permission evidence',
                  tags: 'Tags (comma-separated; use logo for a logo asset)',
                }[k]
              }
              <input
                className={input}
                required={k === 'sourceUrl'}
                value={source[k]}
                onChange={(e) => setSource({ ...source, [k]: e.target.value })}
              />
            </label>
          ))}
          <label className="block">
            Image file (PNG, JPEG or WebP, up to 500 KB)
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => void upload(e.target.files?.[0])}
            />
          </label>
          <p>
            {keys.length
              ? 'Image bytes saved; reference remains unreviewed until an explicit decision.'
              : 'No image uploaded.'}
          </p>
          <label className="flex gap-2">
            <input
              type="checkbox"
              checked={source.copyrightDeclared}
              onChange={(e) => setSource({ ...source, copyrightDeclared: e.target.checked })}
            />
            I declare ownership or permission; this declaration still requires review.
          </label>
          <button className={button} disabled={busy || !keys.length}>
            Save unreviewed reference version
          </button>
        </form>
        <div className="grid gap-4 md:grid-cols-2">
          {refs.map((r) => (
            <article key={r.id} className="space-y-2 rounded border p-3">
              <h3 className="font-semibold">
                {r.captionText.slice(0, 80) || 'Reference image'} · v{r.version}
              </h3>
              <p>
                {r.status} · {r.tags.join(', ')}
              </p>
              <img
                alt="Reference review preview"
                className="max-h-48 w-full object-contain"
                src={`/v1/brand/guidance/references/${r.id}/image/0`}
              />
              <p className="break-all">
                Source: {r.sourceUrl ?? 'Not recorded — create a new version with source evidence.'}
              </p>
              <p>
                Owner: {r.copyrightOwner || 'Not supplied'} · Permission:{' '}
                {r.licenseReference || 'Not supplied'}
              </p>
              <p>
                Version history:{' '}
                {r.history.map((v) => `v${v.version}`).join(', ') || 'Legacy version'}
              </p>
              <details>
                <summary>Review history</summary>
                {r.reviewHistory?.map((e) => (
                  <p key={e.id}>
                    {e.decision} · {e.notes} · {e.actorUserId} ·{' '}
                    {new Date(e.createdAt).toLocaleString()}
                  </p>
                ))}
              </details>
              <label className="block">
                Review notes
                <input
                  className={input}
                  value={notes[r.id] ?? ''}
                  onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })}
                />
              </label>
              <label className="flex gap-2">
                <input
                  type="checkbox"
                  checked={rights[r.id] ?? false}
                  onChange={(e) => setRights({ ...rights, [r.id]: e.target.checked })}
                />
                I inspected this image and verified permission to use this exact version.
              </label>
              <div className="flex flex-wrap gap-2">
                {(['APPROVED', 'REJECTED', 'REVOKED'] as const).map((decision) => (
                  <button
                    className={button}
                    key={decision}
                    disabled={
                      busy ||
                      !((notes[r.id]?.trim().length ?? 0) >= 3) ||
                      (decision === 'APPROVED' && !rights[r.id])
                    }
                    onClick={() =>
                      void run(() =>
                        apiClient.post(`/v1/brand/guidance/references/${r.id}/review`, {
                          digest: r.sourceDigest,
                          expectedReviewEventId: r.reviewEventId ?? null,
                          confirmed: true,
                          decision,
                          notes: notes[r.id],
                          rightsConfirmed: rights[r.id] ?? false,
                        }),
                      )
                    }
                  >
                    {decision === 'APPROVED'
                      ? 'Approve reference'
                      : decision === 'REJECTED'
                        ? 'Reject reference'
                        : 'Revoke permission'}
                  </button>
                ))}
                <button className={button} disabled={busy} onClick={() => reviseSource(r)}>
                  Create new reference version
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
      <p className="text-sm">
        Business inputs still needed: actual logo/usage rights or explicit text-only identity,
        colors, accepted installed fonts, Khmer/English terminology and tone, store contacts, CTA,
        claims policy, channel layouts and representative source images with permission evidence.
      </p>
    </main>
  );
}
