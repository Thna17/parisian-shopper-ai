import { callbackData, type TelegramButton } from '@parisian-shopper/application';

export interface VisualReviewTokens {
  readonly approveToken: string;
  readonly requestEditToken: string;
  readonly regenerateToken: string;
  readonly rejectToken: string;
}

export function buildVisualReviewKeyboard(
  tokens: VisualReviewTokens,
): readonly (readonly TelegramButton[])[] {
  return [
    [
      { text: '✅ Approve Visual', callbackData: callbackData(tokens.approveToken) },
      { text: '✏️ Request Edit', callbackData: callbackData(tokens.requestEditToken) },
    ],
    [
      { text: '🔄 Regenerate', callbackData: callbackData(tokens.regenerateToken) },
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
      { text: '✅ Confirm Approval', callbackData: callbackData(confirmToken) },
      { text: '❌ Cancel', callbackData: callbackData(cancelToken) },
    ],
  ];
}
