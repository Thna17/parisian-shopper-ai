import {
  normalizedProductEnvelopeSchema,
  type NormalizedProductEnvelope,
} from '../domain/product.schema.js';

const SOURCE = 'geparlys-parfums-paris-catalog';
const RETRIEVED_AT = '2026-10-14T12:00:00.000Z';
const UPDATED_AT = '2026-10-14T10:00:00.000Z';

function envelope(
  recordId: string,
  product: NormalizedProductEnvelope['product'],
  sourceVersion = 'geparlys-v1',
): NormalizedProductEnvelope {
  return normalizedProductEnvelopeSchema.parse({
    schema_version: '1.0',
    source_system: SOURCE,
    source_record_id: recordId,
    source_version: sourceVersion,
    retrieved_at: RETRIEVED_AT,
    source_updated_at: UPDATED_AT,
    lifecycle_status: 'active',
    product,
  });
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value)) {
      deepFreeze(item);
    }
  }
  return value;
}

export const GEPARLYS_PRODUCTS: readonly NormalizedProductEnvelope[] = deepFreeze([
  envelope('gep-product-001', {
    sku: 'GEP-KING-EDP-100',
    product_name: 'Yes I Am The King Eau de Parfum',
    brand: 'Geparlys Parfums Paris',
    category: 'fragrance',
    price: '48.00',
    currency: 'USD',
    description:
      'The signature lion-crested masculine fragrance from Geparlys Paris, featuring sparkling citrus accords, an aromatic lavender heart, and an opulent ambergris-vetiver finish.',
    images: [
      {
        url: 'https://assets.geparlys.invalid/products/GEP-KING-EDP-100/front.jpg',
        role: 'primary',
        position: 1,
        alt_text: 'Bottle of Yes I Am The King Eau de Parfum with lion medallion',
        sha256: '60136f208cf5da313ea5a0f3568f1a0d6fcc6ec06275938fedea562bc7479232',
      },
    ],
    stock_status: 'in_stock',
    product_url: 'https://shop.geparlys.invalid/products/GEP-KING-EDP-100',
    fragrance_notes: {
      top: ['Bergamot', 'Grapefruit', 'Crisp Apple', 'Sweet Orange'],
      heart: ['Lavender', 'Elemi Resin', 'Geranium'],
      base: ['Ambergris', 'Haitian Vetiver', 'White Musk', 'Patchouli'],
    },
    concentration: { code: 'EDP', label: 'Eau de Parfum' },
    size: { value: '100', unit: 'ml', display: '100 ml' },
    country_of_origin: { code: 'FR', name: 'France' },
  }),

  envelope('gep-product-002', {
    sku: 'GEP-KING-PRF-100',
    product_name: 'Yes I Am The King Le Parfum',
    brand: 'Geparlys Parfums Paris',
    category: 'fragrance',
    price: '55.00',
    currency: 'USD',
    description:
      'The most intense and regal expression of the King collection. A concentrated parfum blending warm French spices, powdery Florentine iris, and majestic resinous woods.',
    images: [
      {
        url: 'https://assets.geparlys.invalid/products/GEP-KING-PRF-100/front.jpg',
        role: 'primary',
        position: 1,
        alt_text: 'Bottle of Yes I Am The King Le Parfum in deep midnight flacon',
        sha256: '82d817cc42583f29ed7880c941709fd0a38248a0c2578de23bdc66c58831418a',
      },
    ],
    stock_status: 'in_stock',
    product_url: 'https://shop.geparlys.invalid/products/GEP-KING-PRF-100',
    fragrance_notes: {
      top: ['Coriander Seed', 'Primofiore Lemon', 'Warm Nutmeg'],
      heart: ['French Lavender', 'Florentine Iris', 'Candied Violet', 'Tonka Bean'],
      base: ['Precious Sandalwood', 'Olibanum Frankincense', 'Smoky Vetiver', 'Tree Moss'],
    },
    concentration: { code: 'PARFUM', label: 'Parfum' },
    size: { value: '100', unit: 'ml', display: '100 ml' },
    country_of_origin: { code: 'FR', name: 'France' },
  }),

  envelope('gep-product-003', {
    sku: 'GEP-KING-LGD-100',
    product_name: 'Yes I Am The King Legend Eau de Parfum',
    brand: 'Geparlys Parfums Paris',
    category: 'fragrance',
    price: '49.50',
    currency: 'USD',
    description:
      'A bold and modern woody-aromatic masterpiece crafted in Paris, balancing vibrant cardamom and crisp apple against an enduring patchouli and cedarwood base.',
    images: [
      {
        url: 'https://assets.geparlys.invalid/products/GEP-KING-LGD-100/front.jpg',
        role: 'primary',
        position: 1,
        alt_text: 'Bottle of Yes I Am The King Legend with golden lion crest',
        sha256: '82d817cc42583f29ed7880c941709fd0a38248a0c2578de23bdc66c58831418a',
      },
    ],
    stock_status: 'in_stock',
    product_url: 'https://shop.geparlys.invalid/products/GEP-KING-LGD-100',
    fragrance_notes: {
      top: ['Pink Grapefruit', 'Cardamom', 'Cedar Needles'],
      heart: ['French Lavender', 'Green Apple', 'Bourbon Geranium'],
      base: ['Virginian Cedarwood', 'Indonesian Patchouli', 'Warm Amber'],
    },
    concentration: { code: 'EDP', label: 'Eau de Parfum' },
    size: { value: '100', unit: 'ml', display: '100 ml' },
    country_of_origin: { code: 'FR', name: 'France' },
  }),

  envelope('gep-product-004', {
    sku: 'GEP-UNP-NOIR-100',
    product_name: 'Glenn Perri Unpredictable Noir Eau de Parfum',
    brand: 'Glenn Perri by Geparlys',
    category: 'fragrance',
    price: '42.00',
    currency: 'USD',
    description:
      'The globally acclaimed fruity-smoky fragrance from Glenn Perri Paris. Opening with crisp black currant and bergamot, leading to a smoky birch and warm vanilla trail.',
    images: [
      {
        url: 'https://assets.geparlys.invalid/products/GEP-UNP-NOIR-100/front.jpg',
        role: 'primary',
        position: 1,
        alt_text: 'Bottle of Glenn Perri Unpredictable Noir in matte black silhouette',
        sha256: '82d817cc42583f29ed7880c941709fd0a38248a0c2578de23bdc66c58831418a',
      },
    ],
    stock_status: 'in_stock',
    product_url: 'https://shop.geparlys.invalid/products/GEP-UNP-NOIR-100',
    fragrance_notes: {
      top: ['Black Currant', 'Calabrian Bergamot', 'Crisp Apple'],
      heart: ['Moroccan Jasmine', 'French Rose', 'Smoky Birch'],
      base: ['Sensual Amber', 'Oakmoss', 'Patchouli', 'Madagascar Vanilla'],
    },
    concentration: { code: 'EDP', label: 'Eau de Parfum' },
    size: { value: '100', unit: 'ml', display: '100 ml' },
    country_of_origin: { code: 'FR', name: 'France' },
  }),

  envelope('gep-product-005', {
    sku: 'GEP-UNP-HOM-100',
    product_name: 'Glenn Perri Unpredictable Pour Homme Eau de Toilette',
    brand: 'Glenn Perri by Geparlys',
    category: 'fragrance',
    price: '38.00',
    currency: 'USD',
    description:
      'The iconic original Unpredictable pour homme. An energetic bouquet of fresh orchard fruits and radiant floral notes over a warm, masculine amber base.',
    images: [
      {
        url: 'https://assets.geparlys.invalid/products/GEP-UNP-HOM-100/front.jpg',
        role: 'primary',
        position: 1,
        alt_text: 'Bottle of Glenn Perri Unpredictable Pour Homme',
        sha256: '82d817cc42583f29ed7880c941709fd0a38248a0c2578de23bdc66c58831418a',
      },
    ],
    stock_status: 'in_stock',
    product_url: 'https://shop.geparlys.invalid/products/GEP-UNP-HOM-100',
    fragrance_notes: {
      top: ['Williams Pear', 'Granny Smith Apple', 'Mandarin Orange', 'Cassis'],
      heart: ['Night-Blooming Jasmine', 'Centifolia Rose', 'Lily of the Valley', 'Orange Blossom'],
      base: ['Cistus Labdanum', 'Golden Amber', 'Patchouli', 'White Musk'],
    },
    concentration: { code: 'EDT', label: 'Eau de Toilette' },
    size: { value: '100', unit: 'ml', display: '100 ml' },
    country_of_origin: { code: 'FR', name: 'France' },
  }),

  envelope('gep-product-006', {
    sku: 'GEP-JOH-SED-085',
    product_name: 'Johan B. Be Seduced Eau de Parfum',
    brand: 'Johan B. by Geparlys',
    category: 'fragrance',
    price: '44.00',
    currency: 'USD',
    description:
      'A seductive Parisian gourmand fragrance for women, enveloped in luscious blackberries, praline sweetness, and an intoxicating gardenia and vanilla trail.',
    images: [
      {
        url: 'https://assets.geparlys.invalid/products/GEP-JOH-SED-085/front.jpg',
        role: 'primary',
        position: 1,
        alt_text: 'Curved jewel flacon of Johan B. Be Seduced Eau de Parfum',
        sha256: '82d817cc42583f29ed7880c941709fd0a38248a0c2578de23bdc66c58831418a',
      },
    ],
    stock_status: 'in_stock',
    product_url: 'https://shop.geparlys.invalid/products/GEP-JOH-SED-085',
    fragrance_notes: {
      top: ['Italian Mandarin', 'Wild Blackberry', 'White Freesia'],
      heart: ['Velvet Gardenia', 'Jasmine Sambac', 'Artisanal Praline'],
      base: ['Australian Sandalwood', 'Bourbon Vanilla', 'Sensual Musk', 'Liquid Amber'],
    },
    concentration: { code: 'EDP', label: 'Eau de Parfum' },
    size: { value: '85', unit: 'ml', display: '85 ml' },
    country_of_origin: { code: 'FR', name: 'France' },
  }),

  envelope('gep-product-007', {
    sku: 'GEP-JOH-ICN-090',
    product_name: 'Johan B. Rich Icône Pour Homme Eau de Toilette',
    brand: 'Johan B. by Geparlys',
    category: 'fragrance',
    price: '40.00',
    currency: 'USD',
    description:
      'An invigorating aquatic-woody fragrance reflecting Parisian urban sophistication, combining frosted mint and sea breezes with sturdy Atlas cedar.',
    images: [
      {
        url: 'https://assets.geparlys.invalid/products/GEP-JOH-ICN-090/front.jpg',
        role: 'primary',
        position: 1,
        alt_text: 'Bottle of Johan B. Rich Icône in crystalline blue',
        sha256: '82d817cc42583f29ed7880c941709fd0a38248a0c2578de23bdc66c58831418a',
      },
    ],
    stock_status: 'in_stock',
    product_url: 'https://shop.geparlys.invalid/products/GEP-JOH-ICN-090',
    fragrance_notes: {
      top: ['Frosted Grapefruit', 'Crushed Mint', 'Crisp Green Apple'],
      heart: ['Wild Lavender', 'Mediterranean Marine Accord', 'Atlas Cedar'],
      base: ['Forest Oakmoss', 'Amber Woods', 'Clean Musk'],
    },
    concentration: { code: 'EDT', label: 'Eau de Toilette' },
    size: { value: '90', unit: 'ml', display: '90 ml' },
    country_of_origin: { code: 'FR', name: 'France' },
  }),

  envelope('gep-product-008', {
    sku: 'GEP-KL-COU-100',
    product_name: 'Karen Low Pure Couture Eau de Parfum',
    brand: 'Karen Low by Geparlys',
    category: 'fragrance',
    price: '39.00',
    currency: 'USD',
    description:
      'An elegant Parisian haute-couture feminine fragrance, celebrating sparkling pink pepper, luminous white magnolias, and a sophisticated sandalwood drydown.',
    images: [
      {
        url: 'https://assets.geparlys.invalid/products/GEP-KL-COU-100/front.jpg',
        role: 'primary',
        position: 1,
        alt_text: 'Bottle of Karen Low Pure Couture with satin bow',
        sha256: '82d817cc42583f29ed7880c941709fd0a38248a0c2578de23bdc66c58831418a',
      },
    ],
    stock_status: 'in_stock',
    product_url: 'https://shop.geparlys.invalid/products/GEP-KL-COU-100',
    fragrance_notes: {
      top: ['Sparkling Citruses', 'Pink Pepper'],
      heart: ['Magnolia Petals', 'Grasse Jasmine'],
      base: ['Bourbon Vetiver', 'Soft Musk', 'Mysore Sandalwood', 'Golden Amber'],
    },
    concentration: { code: 'EDP', label: 'Eau de Parfum' },
    size: { value: '100', unit: 'ml', display: '100 ml' },
    country_of_origin: { code: 'FR', name: 'France' },
  }),

  envelope('gep-product-009', {
    sku: 'GEP-KL-BLA-100',
    product_name: 'Karen Low Pure Blanc Eau de Toilette',
    brand: 'Karen Low by Geparlys',
    category: 'fragrance',
    price: '36.00',
    currency: 'USD',
    description:
      'Clean, crystalline, and effortlessly chic. Pure Blanc pairs juicy pineapple and citrus with a breezy violet leaf accord and refined cedarwood.',
    images: [
      {
        url: 'https://assets.geparlys.invalid/products/GEP-KL-BLA-100/front.jpg',
        role: 'primary',
        position: 1,
        alt_text: 'Pristine white bottle of Karen Low Pure Blanc',
        sha256: '82d817cc42583f29ed7880c941709fd0a38248a0c2578de23bdc66c58831418a',
      },
    ],
    stock_status: 'in_stock',
    product_url: 'https://shop.geparlys.invalid/products/GEP-KL-BLA-100',
    fragrance_notes: {
      top: ['Italian Bergamot', 'Mandarin Orange', 'Sun-Ripened Pineapple'],
      heart: ['Violet Leaf', 'Nutmeg', 'Green Cardamom'],
      base: ['Virginian Cedar', 'Warm Amber', 'Clean White Musk'],
    },
    concentration: { code: 'EDT', label: 'Eau de Toilette' },
    size: { value: '100', unit: 'ml', display: '100 ml' },
    country_of_origin: { code: 'FR', name: 'France' },
  }),

  envelope('gep-product-010', {
    sku: 'GEP-LOR-WHT-100',
    product_name: "Geparlys L'Oriental White Edition Eau de Parfum",
    brand: 'Geparlys Parfums Paris',
    category: 'fragrance',
    price: '46.00',
    currency: 'USD',
    description:
      'A captivating oriental-fresh composition from Geparlys Paris, featuring cooling melon and violet leaves grounded by marine amber and white sandalwood.',
    images: [
      {
        url: 'https://assets.geparlys.invalid/products/GEP-LOR-WHT-100/front.jpg',
        role: 'primary',
        position: 1,
        alt_text: "Bottle of Geparlys L'Oriental White Edition in ceramic white",
        sha256: '82d817cc42583f29ed7880c941709fd0a38248a0c2578de23bdc66c58831418a',
      },
    ],
    stock_status: 'in_stock',
    product_url: 'https://shop.geparlys.invalid/products/GEP-LOR-WHT-100',
    fragrance_notes: {
      top: ['Green Cardamom', 'Crisp Grapefruit', 'Aqueous Green Accords'],
      heart: ['French Melon', 'Cedar Needles', 'Night Violet'],
      base: ['Precious Sandalwood', 'Marine Amber', 'White Leather'],
    },
    concentration: { code: 'EDP', label: 'Eau de Parfum' },
    size: { value: '100', unit: 'ml', display: '100 ml' },
    country_of_origin: { code: 'FR', name: 'France' },
  }),
]);
