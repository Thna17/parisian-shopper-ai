import type { Prisma } from '@prisma/client';
/** A state change and its notification intent commit atomically. Delivery never generates content. */
export async function appendPostEvent(
  tx: Prisma.TransactionClient,
  input: { data: Prisma.PostEventUncheckedCreateInput },
): Promise<void> {
  const event = await tx.postEvent.create(input);
  await tx.outboxEvent.create({
    data: {
      topic: 'POST_CHANGED',
      idempotencyKey: `post-event:${event.id}`,
      aggregateType: 'Post',
      aggregateId: event.postId,
      payload: { postId: event.postId, revisionId: event.revisionId, action: event.action },
      occurredAt: event.createdAt,
      availableAt: event.createdAt,
    },
  });
}
