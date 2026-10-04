export type EntityId = string & { readonly __entityId: unique symbol };

export function asEntityId(value: string): EntityId {
  if (value.length === 0) {
    throw new Error('Entity ID cannot be empty');
  }
  return value as EntityId;
}
