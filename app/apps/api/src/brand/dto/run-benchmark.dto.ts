import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';

export class TestCaseInputDto {
  @ApiProperty({ description: 'Unique identifier for the test case', example: 'tc-perf-01' })
  @IsString()
  @IsNotEmpty()
  public testCaseId!: string;

  @ApiProperty({
    description: 'Generation prompt instruction',
    example: 'Describe the scent notes',
  })
  @IsString()
  @IsNotEmpty()
  public prompt!: string;

  @ApiProperty({
    description: 'Candidate copy to benchmark against brand rules',
    example: 'Artisanat français d’exception.',
  })
  @IsString()
  @IsNotEmpty()
  public candidateText!: string;

  @ApiProperty({ description: 'Category grouping', required: false, example: 'FRAGRANCE' })
  @IsOptional()
  @IsString()
  public category?: string;
}

export class RunBenchmarkDto {
  @ApiProperty({
    description: 'Identifier of the brand profile being benchmarked',
    required: false,
    example: 'prof-v1',
  })
  @IsOptional()
  @IsString()
  public profileId?: string;

  @ApiProperty({
    description: 'Identifier of the benchmark test dataset partition',
    required: false,
    example: 'dataset-autumn-2026',
  })
  @IsOptional()
  @IsString()
  public testDatasetId?: string;

  @ApiProperty({
    description: 'Evaluation policy identifier',
    required: false,
    example: 'default-anti-regurgitation-policy-v1',
  })
  @IsOptional()
  @IsString()
  public policyId?: string;

  @ApiProperty({
    description: 'Custom benchmark test cases (uses standard suite if omitted)',
    type: [TestCaseInputDto],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TestCaseInputDto)
  public testCases?: TestCaseInputDto[];
}
