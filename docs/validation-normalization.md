# Validation normalization

Normalization is comparison-only and never changes the product snapshot or generated content.

- Text uses Unicode NFKC, locale-stable lowercase, punctuation/symbol folding, whitespace collapse, and trim.
- Money permits `$`, `€`, `៛`, and ISO currency codes before or after the value. Decimal strings trim insignificant zeroes; no binary floating point is used.
- SKU comparison is case-insensitive after removing sentence-ending punctuation from labelled claims. Internal SKU punctuation remains significant.
- Sizes normalize decimal formatting, whitespace, and unit case. There is no unit conversion in v1.
- Concentration aliases are explicitly limited to EDP/Eau de Parfum, EDT/Eau de Toilette, and Parfum/perfume.
- Country aliases are explicitly controlled for France and Cambodia in English and Khmer, plus two-letter country codes. Unknown names do not become equivalent.
- Fragrance notes are normalized per note, but tier membership remains exact; a top note cannot satisfy a heart-note claim.

Khmer v1 detects explicit origin phrases, money/currency forms, promotion wording, stock availability/quantity patterns, and numeric longevity claims. It does not attempt general Khmer semantic equivalence. New aliases or patterns require focused unit tests and review for collision risk.

Normalization must be conservative: harmless typography can compare equal, but unrelated words are never treated as equivalent. Changes that alter validation outcomes should normally create a new validator version so historical decisions remain reproducible.
