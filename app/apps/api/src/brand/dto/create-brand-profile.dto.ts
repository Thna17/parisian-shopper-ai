import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsNotEmpty, IsObject, IsString, MaxLength } from 'class-validator';
import type {
  LanguagePolicy,
  LogoRules,
  ToneRules,
  TypographyRules,
  VisualAestheticRules,
} from '@parisian-shopper/application';

export class CreateBrandProfileDto {
  @ApiProperty({
    description: 'Name of the brand profile version',
    example: 'PARISIAN_LUXURY_V1_CORE',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  public name!: string;

  @ApiProperty({
    description: 'Evaluation policy ID governing similarity thresholds',
    example: 'default-anti-regurgitation-policy-v1',
  })
  @IsString()
  @IsNotEmpty()
  public evaluationPolicyId!: string;

  @ApiProperty({ description: 'Language and script formatting conventions' })
  @IsObject()
  public languagePolicy!: LanguagePolicy;

  @ApiProperty({ description: 'Tone and luxury vocabulary rules' })
  @IsObject()
  public toneRules!: ToneRules;

  @ApiProperty({ description: 'Visual palettes, lighting, and textures' })
  @IsObject()
  public visualAestheticRules!: VisualAestheticRules;

  @ApiProperty({ description: 'Typography hierarchy and allowed fonts' })
  @IsObject()
  public typographyRules!: TypographyRules;

  @ApiProperty({ description: 'Logo placement, clear space, and variants' })
  @IsObject()
  public logoRules!: LogoRules;

  @ApiProperty({
    description: 'Whitelisted example IDs for few-shot prompt injection',
    type: [String],
    required: false,
  })
  @IsArray()
  public approvedExampleIds: string[] = [];

  @ApiProperty({
    description: 'Negative prompt phrases and prohibited words',
    type: [String],
    required: false,
  })
  @IsArray()
  public prohibitedPatterns: string[] = [];
}
