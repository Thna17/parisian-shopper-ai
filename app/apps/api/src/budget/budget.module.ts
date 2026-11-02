import { Module } from '@nestjs/common';
import { ApplicationModule, BudgetModule } from '@parisian-shopper/application';
import { DatabaseModule } from '@parisian-shopper/database';
import { AuthModule } from '../auth/auth.module.js';
import { BudgetController } from './budget.controller.js';

@Module({
  imports: [ApplicationModule, DatabaseModule, AuthModule, BudgetModule],
  controllers: [BudgetController],
})
export class BudgetApiModule {}
