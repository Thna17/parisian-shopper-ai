/**
 * All production queue names must be declared here before use.
 * Phase 1A intentionally defines no business queue.
 */
export const QueueName = Object.freeze({});

export type QueueName = string & { readonly __queueName: unique symbol };
