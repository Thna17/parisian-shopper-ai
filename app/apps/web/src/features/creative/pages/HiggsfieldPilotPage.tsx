import React from 'react';
import { Link } from 'react-router-dom';

/** Local pilot preview only. This is not a creative project or an approval record. */
export const HiggsfieldPilotPage: React.FC = () => (
  <main className="mx-auto max-w-3xl space-y-4 p-6">
    <Link to="/creative" className="text-sm text-brand-burgundy">
      ← Creative Studio
    </Link>
    <h1 className="text-2xl font-serif font-bold">Imported Higgsfield test concept</h1>
    <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
      Unapproved local preview for Yes I Am The King Eau de Parfum. This image was generated through
      Codex and imported manually; it is not connected to the app’s generation, validation, review,
      approval, or publishing workflows. Do not publish it.
    </p>
    <img
      src="/higgsfield-pilot-local.png"
      alt="Unapproved Higgsfield poster concept for Yes I Am The King Eau de Parfum"
      className="w-full rounded-xl"
    />
  </main>
);
