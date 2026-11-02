import { Inject, Injectable } from '@nestjs/common';
import { type SystemSettingRecord } from '../../domain/employee.types.js';
import {
  SYSTEM_SETTING_REPOSITORY,
  type SystemSettingRepository,
} from '../ports/system-setting.repository.js';

export interface SystemSettingsOverview {
  readonly organization: Record<string, unknown>;
  readonly workflow: Record<string, unknown>;
  readonly notifications: Record<string, unknown>;
  readonly aiBudgetSummary: {
    readonly monthlyCeiling: number;
    readonly perRequestCeiling: number;
    readonly costControlUrl: string;
  };
  readonly rawSettings: readonly SystemSettingRecord[];
}

const DEFAULT_ORGANIZATION = {
  name: 'Parisian Shopper AI',
  contactEmail: 'contact@parisianshopper.com',
  timezone: 'UTC',
  defaultLanguage: 'fr',
};

const DEFAULT_WORKFLOW = {
  sessionTtlHours: 8,
  maxLoginFailures: 5,
  lockoutDurationMinutes: 15,
  requireFourEyesCreative: true,
  requireFourEyesContent: true,
};

const DEFAULT_NOTIFICATIONS = {
  telegramNotificationsEnabled: true,
  emailNotificationsEnabled: false,
  alertThresholdPercent: 80,
};

@Injectable()
export class GetSystemSettingsUseCase {
  public constructor(
    @Inject(SYSTEM_SETTING_REPOSITORY)
    private readonly settingRepo: SystemSettingRepository,
  ) {}

  public async execute(): Promise<SystemSettingsOverview> {
    const rawSettings = await this.settingRepo.findAll();

    const orgSetting = rawSettings.find((s) => s.key === 'ORGANIZATION_PROFILE');
    const workflowSetting = rawSettings.find((s) => s.key === 'WORKFLOW_POLICIES');
    const notifSetting = rawSettings.find((s) => s.key === 'NOTIFICATION_PREFERENCES');

    return {
      organization: orgSetting ? orgSetting.value : DEFAULT_ORGANIZATION,
      workflow: workflowSetting ? workflowSetting.value : DEFAULT_WORKFLOW,
      notifications: notifSetting ? notifSetting.value : DEFAULT_NOTIFICATIONS,
      aiBudgetSummary: {
        monthlyCeiling: 20.0,
        perRequestCeiling: 0.5,
        costControlUrl: '/analytics/costs',
      },
      rawSettings,
    };
  }
}
