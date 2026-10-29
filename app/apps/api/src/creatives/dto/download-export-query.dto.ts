import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class DownloadExportQueryDto {
  @ApiPropertyOptional({
    description: 'Short-lived HMAC-SHA256 download authorization token (1-hour TTL)',
  })
  @IsOptional()
  @IsString()
  public readonly token?: string;
}
