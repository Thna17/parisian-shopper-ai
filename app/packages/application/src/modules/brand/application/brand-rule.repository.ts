import { type BrandRules } from '../domain/brand-rule.schema.js';

export const BRAND_RULE_REPOSITORY = Symbol('BRAND_RULE_REPOSITORY');

export interface BrandRuleVersion {
  id: string;
  name: string;
  version: number;
  status: 'DRAFT' | 'ACTIVE' | 'RETIRED';
  rules: BrandRules;
  createdAt: Date;
  activatedAt?: Date;
}

export interface CreateBrandRuleVersionInput {
  name: string;
  version: number;
  status: BrandRuleVersion['status'];
  rules: BrandRules;
  activatedAt?: Date;
}

export interface BrandRuleRepository {
  create(input: CreateBrandRuleVersionInput): Promise<BrandRuleVersion>;
  findById(id: string): Promise<BrandRuleVersion | null>;
}
