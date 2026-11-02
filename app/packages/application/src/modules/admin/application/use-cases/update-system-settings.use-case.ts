import { Inject, Injectable } from '@nestjs/common';
import { ApplicationError } from '@parisian-shopper/common';
import { type SystemSettingRecord } from '../../domain/employee.types.js';
import {
  ADMIN_AUDIT_REPOSITORY,
  type AdminAuditRepository,
} from '../ports/admin-audit.repository.js';
import {
  SYSTEM_SETTING_REPOSITORY,
  type SystemSettingRepository,
} from '../ports/system-setting.repository.js';

export interface UpdateSystemSettingRequest {
  readonly key: string;
  readonly value: Record<string, unknown>;
  readonly category?: string | undefined;
  readonly description?: string | undefined;
  readonly actorUserId: string;
}

const ALLOWED_SETTING_KEYS = new Set([
  'ORGANIZATION_PROFILE',
  'WORKFLOW_POLICIES',
  'NOTIFICATION_PREFERENCES',
]);

@Injectable()
export class UpdateSystemSettingsUseCase {
  public constructor(
    @Inject(SYSTEM_SETTING_REPOSITORY)
    private readonly settingRepo: SystemSettingRepository,
    @Inject(ADMIN_AUDIT_REPOSITORY)
    private readonly auditRepo: AdminAuditRepository,
  ) {}

  public async execute(request: UpdateSystemSettingRequest): Promise<SystemSettingRecord> {
    if (!ALLOWED_SETTING_KEYS.has(request.key)) {
      throw new ApplicationError({
        code: 'VALIDATION_ERROR',
        publicMessage: `Unsupported setting key '${request.key}'. Editable settings are: ${Array.from(ALLOWED_SETTING_KEYS).join(', ')}`,
      });
    }

    if (!request.value || typeof request.value !== 'object' || Array.isArray(request.value)) {
      throw new ApplicationError({
        code: 'VALIDATION_ERROR',
        publicMessage: 'Setting value must be a valid JSON object.',
      });
    }

    const previous = await this.settingRepo.findByKey(request.key);

    const updated = await this.settingRepo.upsert({
      key: request.key,
      value: request.value,
      category: request.category ?? 'GENERAL',
      description: request.description ?? null,
      updatedById: request.actorUserId,
    });

    await this.auditRepo.record({
      actorUserId: request.actorUserId,
      action: 'SYSTEM_SETTING_UPDATED',
      resourceType: 'SystemSetting',
      resourceId: request.key,
      metadata: {
        key: request.key,
        previousValue: previous?.value ?? null,
        newValue: request.value,
      },
    });

    return updated;
  }
}
