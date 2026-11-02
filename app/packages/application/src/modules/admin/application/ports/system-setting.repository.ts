import { type SystemSettingRecord } from '../../domain/employee.types.js';

export const SYSTEM_SETTING_REPOSITORY = Symbol('SYSTEM_SETTING_REPOSITORY');

export interface UpsertSystemSettingInput {
  readonly key: string;
  readonly value: Record<string, unknown>;
  readonly category?: string;
  readonly description?: string | null;
  readonly updatedById?: string | null;
}

export interface SystemSettingRepository {
  findAll(): Promise<readonly SystemSettingRecord[]>;
  findByKey(key: string): Promise<SystemSettingRecord | null>;
  upsert(input: UpsertSystemSettingInput): Promise<SystemSettingRecord>;
}
