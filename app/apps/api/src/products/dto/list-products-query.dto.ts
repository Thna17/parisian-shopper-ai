import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListProductsQueryDto {
  @IsOptional()
  @IsString()
  public q?: string | undefined;

  @IsOptional()
  @IsString()
  public search?: string | undefined;

  @IsOptional()
  @IsString()
  public brand?: string | undefined;

  @IsOptional()
  @IsString()
  public category?: string | undefined;

  @IsOptional()
  @IsString()
  public stockStatus?: string | undefined;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  public page?: number | undefined = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  public limit?: number | undefined = 20;
}
