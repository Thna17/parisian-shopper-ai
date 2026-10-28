import { ApplicationError } from '@parisian-shopper/common';

export function telegramSafeError(error: unknown): string {
  if (!(error instanceof ApplicationError)) return 'Something went wrong. Please try again later.';
  const messages: Partial<Record<ApplicationError['code'], string>> = {
    PRODUCT_NOT_FOUND: 'Product not found.',
    VALIDATION_ERROR: 'The command input is invalid. Check the value and try again.',
    MISSING_REQUIRED_PRODUCT_DATA:
      'This content type cannot be generated because required verified product data is missing.',
    AI_PROVIDER_TIMEOUT: 'Content generation timed out. Please try again later.',
    AI_PROVIDER_UNAVAILABLE: 'Content generation is temporarily unavailable.',
    PRODUCT_SOURCE_UNAVAILABLE: 'The product catalogue is temporarily unavailable.',
    PRODUCT_SOURCE_TIMEOUT: 'The product catalogue timed out. Please try again later.',
    SELF_APPROVAL_PROHIBITED:
      'Four-eyes policy violation: You cannot approve content you requested or authored.',
  };
  return messages[error.code] ?? error.publicMessage;
}
