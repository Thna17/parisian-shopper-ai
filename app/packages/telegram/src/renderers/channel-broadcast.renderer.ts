import { type TelegramButton } from '@parisian-shopper/application';

export interface ChannelBroadcastDetails {
  readonly productName: string;
  readonly brand?: string | undefined;
  readonly sku?: string | undefined;
  readonly price?: string | number | undefined;
  readonly currency?: string | undefined;
  readonly headline?: string | undefined;
  readonly frenchCaption?: string | null | undefined;
  readonly englishCaption?: string | null | undefined;
  readonly cta?: string | undefined;
  readonly hashtags?: readonly string[] | undefined;
}

export function escapeMarkdownV2(text: string): string {
  return text.replace(/([_*[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}

export class ChannelBroadcastRenderer {
  public static readonly MAX_CAPTION_LENGTH = 1024;

  public static renderCaption(details: ChannelBroadcastDetails): string {
    const lines: string[] = [];

    // Luxury Header
    lines.push('✨ *PARISIAN LUXURY SELECTION* ✨');
    lines.push('');

    // Product Title
    lines.push(`💎 *${escapeMarkdownV2(details.productName)}*`);

    // Metadata line (Brand • Price • SKU)
    const metaParts: string[] = [];
    if (details.brand) {
      metaParts.push(`_${escapeMarkdownV2(details.brand)}_`);
    }
    if (details.price !== undefined) {
      const priceStr =
        details.currency === 'USD'
          ? `$${String(details.price)}`
          : `${String(details.price)} ${details.currency ?? 'EUR'}`;
      metaParts.push(`*${escapeMarkdownV2(priceStr)}*`);
    }
    if (details.sku) {
      metaParts.push(`\`${escapeMarkdownV2(details.sku)}\``);
    }
    if (metaParts.length > 0) {
      lines.push(metaParts.join(' • '));
    }

    lines.push('');

    // Headline
    if (details.headline) {
      lines.push(`*${escapeMarkdownV2(details.headline)}*`);
      lines.push('');
    }

    // Bilingual Copy:
    // French caption (or primary copy)
    if (details.frenchCaption) {
      lines.push(`🇫🇷 ${escapeMarkdownV2(details.frenchCaption)}`);
      lines.push('');
    }

    // English caption
    if (details.englishCaption) {
      lines.push(`🇬🇧 ${escapeMarkdownV2(details.englishCaption)}`);
      lines.push('');
    }

    // Call to action
    if (details.cta) {
      lines.push(`🛎️ _${escapeMarkdownV2(details.cta)}_`);
      lines.push('');
    }

    // Hashtags
    if (details.hashtags && details.hashtags.length > 0) {
      const escapedTags = details.hashtags.map((tag) => escapeMarkdownV2(tag)).join(' ');
      lines.push(escapedTags);
    }

    let caption = lines.join('\n').trim();

    // Guard against Telegram's 1024 character caption limit
    if (caption.length > ChannelBroadcastRenderer.MAX_CAPTION_LENGTH) {
      caption = caption.slice(0, ChannelBroadcastRenderer.MAX_CAPTION_LENGTH - 3) + '...';
    }

    return caption;
  }
}

export function buildChannelBroadcastKeyboard(urls: {
  readonly conciergeUrl?: string;
  readonly checkoutUrl?: string;
}): TelegramButton[][] {
  const row: TelegramButton[] = [];
  const concierge = urls.conciergeUrl ?? 'https://t.me/parisian_concierge';
  row.push({ text: '💬 Inquire with Concierge', url: concierge });
  if (urls.checkoutUrl !== undefined && urls.checkoutUrl.length > 0) {
    row.push({ text: '🛍️ Reserve Now', url: urls.checkoutUrl });
  }
  return [row];
}
