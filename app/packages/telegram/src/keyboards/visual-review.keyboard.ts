import { callbackData, type TelegramButton } from '@parisian-shopper/application';

export interface VisualReviewTokens {
  readonly approveToken: string;
  readonly rejectToken: string;
  readonly editLayoutToken?: string | undefined;
  readonly editTextToken?: string | undefined;
  readonly changeStyleToken?: string | undefined;
  readonly newBackgroundToken?: string | undefined;
  readonly detailsToken?: string | undefined;
  readonly requestEditToken?: string | undefined;
  readonly regenerateToken?: string | undefined;
}

export function buildVisualReviewKeyboard(
  tokens: VisualReviewTokens,
): readonly (readonly TelegramButton[])[] {
  const isExtended =
    tokens.editLayoutToken !== undefined ||
    tokens.editTextToken !== undefined ||
    tokens.changeStyleToken !== undefined ||
    tokens.newBackgroundToken !== undefined ||
    tokens.detailsToken !== undefined;

  if (isExtended) {
    const editLayout = tokens.editLayoutToken ?? tokens.requestEditToken;
    const editText = tokens.editTextToken ?? tokens.requestEditToken;
    const changeStyle = tokens.changeStyleToken ?? tokens.requestEditToken;
    const newBackground = tokens.newBackgroundToken ?? tokens.regenerateToken;

    const rows: TelegramButton[][] = [
      [{ text: '✅ Approve Poster', callbackData: callbackData(tokens.approveToken) }],
    ];

    const editRow: TelegramButton[] = [];
    if (editLayout) {
      editRow.push({ text: '✏️ Edit Layout', callbackData: callbackData(editLayout) });
    }
    if (editText) {
      editRow.push({ text: '📝 Edit Text', callbackData: callbackData(editText) });
    }
    if (editRow.length > 0) rows.push(editRow);

    const styleRow: TelegramButton[] = [];
    if (changeStyle) {
      styleRow.push({ text: '🎨 Change Style', callbackData: callbackData(changeStyle) });
    }
    if (newBackground) {
      styleRow.push({ text: '🔄 New Background', callbackData: callbackData(newBackground) });
    }
    if (styleRow.length > 0) rows.push(styleRow);

    const bottomRow: TelegramButton[] = [
      { text: '❌ Reject', callbackData: callbackData(tokens.rejectToken) },
    ];
    if (tokens.detailsToken) {
      bottomRow.push({ text: 'ℹ️ Details', callbackData: callbackData(tokens.detailsToken) });
    }
    rows.push(bottomRow);

    return rows;
  }

  return [
    [
      { text: '✅ Approve Visual', callbackData: callbackData(tokens.approveToken) },
      { text: '✏️ Request Edit', callbackData: callbackData(tokens.requestEditToken ?? '') },
    ],
    [
      { text: '🔄 Regenerate', callbackData: callbackData(tokens.regenerateToken ?? '') },
      { text: '❌ Reject', callbackData: callbackData(tokens.rejectToken) },
    ],
  ];
}

export function buildConfirmVisualApprovalKeyboard(
  confirmToken: string,
  cancelToken: string,
): readonly (readonly TelegramButton[])[] {
  return [
    [
      { text: '✅ Approve Design', callbackData: callbackData(confirmToken) },
      { text: '❌ Cancel', callbackData: callbackData(cancelToken) },
    ],
  ];
}

export function buildStructuredRevisionConfirmationKeyboard(params: {
  readonly confirmToken: string;
  readonly cancelToken: string;
  readonly changeStyleToken?: string | undefined;
  readonly confirmLabel?: string | undefined;
}): readonly (readonly TelegramButton[])[] {
  const confirmText = params.confirmLabel ?? '✅ Confirm & Apply Revision';
  const rows: TelegramButton[][] = [
    [{ text: confirmText, callbackData: callbackData(params.confirmToken) }],
  ];

  const secondaryRow: TelegramButton[] = [];
  if (params.changeStyleToken) {
    secondaryRow.push({
      text: '🎨 Choose Different Style',
      callbackData: callbackData(params.changeStyleToken),
    });
  }
  secondaryRow.push({
    text: '❌ Cancel',
    callbackData: callbackData(params.cancelToken),
  });
  rows.push(secondaryRow);

  return rows;
}

export function buildApprovedPosterKeyboard(params: {
  exportToken: string;
  publishToken?: string;
  editToken?: string;
  detailsToken?: string;
}): readonly (readonly TelegramButton[])[] {
  const rows: TelegramButton[][] = [
    [{ text: '📥 Export Poster', callbackData: callbackData(params.exportToken) }],
  ];

  if (params.publishToken) {
    rows.push([{ text: '📢 Publish to Channel', callbackData: callbackData(params.publishToken) }]);
  }

  const secondaryRow: TelegramButton[] = [];
  if (params.editToken) {
    secondaryRow.push({ text: '✏️ Edit Design', callbackData: callbackData(params.editToken) });
  }
  if (params.detailsToken) {
    secondaryRow.push({ text: 'ℹ️ Details', callbackData: callbackData(params.detailsToken) });
  }
  if (secondaryRow.length > 0) rows.push(secondaryRow);

  return rows;
}

export function buildExportFormatKeyboard(params: {
  png1x1Token: string;
  jpeg1x1Token: string;
  png4x5Token: string;
  jpeg4x5Token: string;
  png9x16Token?: string;
  jpeg9x16Token?: string;
  backToken: string;
}): readonly (readonly TelegramButton[])[] {
  const rows: TelegramButton[][] = [
    [
      { text: '📥 PNG (1080×1080)', callbackData: callbackData(params.png1x1Token) },
      { text: '📥 JPEG (1080×1080)', callbackData: callbackData(params.jpeg1x1Token) },
    ],
    [
      { text: '📥 PNG (1080×1350)', callbackData: callbackData(params.png4x5Token) },
      { text: '📥 JPEG (1080×1350)', callbackData: callbackData(params.jpeg4x5Token) },
    ],
  ];

  if (params.png9x16Token && params.jpeg9x16Token) {
    rows.push([
      { text: '📥 PNG (1080×1920)', callbackData: callbackData(params.png9x16Token) },
      { text: '📥 JPEG (1080×1920)', callbackData: callbackData(params.jpeg9x16Token) },
    ]);
  }

  rows.push([{ text: '⬅️ Back to Review', callbackData: callbackData(params.backToken) }]);
  return rows;
}

export function buildLayoutSelectionKeyboard(params: {
  editorialSplitToken: string;
  centeredHeroToken: string;
  scentStoryToken: string;
  khmerSeasonalToken: string;
  backToken: string;
}): readonly (readonly TelegramButton[])[] {
  return [
    [
      { text: '📐 Editorial Split', callbackData: callbackData(params.editorialSplitToken) },
      { text: '📐 Centered Hero', callbackData: callbackData(params.centeredHeroToken) },
    ],
    [
      { text: '📐 Scent Story', callbackData: callbackData(params.scentStoryToken) },
      { text: '📐 Khmer Seasonal', callbackData: callbackData(params.khmerSeasonalToken) },
    ],
    [{ text: '⬅️ Back to Review', callbackData: callbackData(params.backToken) }],
  ];
}

export function buildStyleSelectionKeyboard(params: {
  presetTokens: readonly { name: string; token: string }[];
  backToken: string;
}): readonly (readonly TelegramButton[])[] {
  const rows: TelegramButton[][] = params.presetTokens.map((p) => [
    { text: p.name, callbackData: callbackData(p.token) },
  ]);
  rows.push([{ text: '⬅️ Back to Review', callbackData: callbackData(params.backToken) }]);
  return rows;
}

export function buildConfirmPublishKeyboard(params: {
  confirmToken: string;
  cancelToken: string;
}): readonly (readonly TelegramButton[])[] {
  return [
    [
      { text: '🚀 Confirm Channel Publish', callbackData: callbackData(params.confirmToken) },
      { text: '❌ Cancel', callbackData: callbackData(params.cancelToken) },
    ],
  ];
}
