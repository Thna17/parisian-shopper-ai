import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class RevokeSessionsDto {
  @ApiPropertyOptional({
    description: 'Specific session ID to revoke; omit to revoke all active sessions for this user',
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
  })
  @IsOptional()
  @IsUUID()
  public sessionId?: string;
}
