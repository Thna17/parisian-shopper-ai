import { Body, Controller, Get, Param, Post, UseGuards, Res, ParseUUIDPipe } from '@nestjs/common';
import {
  IsObject,
  IsString,
  IsIn,
  IsBoolean,
  MaxLength,
  Equals,
  IsUUID,
  ValidateIf,
} from 'class-validator';
import type { Response } from 'express';
import {
  BrandGuidanceService,
  Permission,
  type BrandReferenceInput,
  type SanitizedEmployeeDto,
} from '@parisian-shopper/application';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator.js';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard.js';
import { CsrfGuard } from '../auth/guards/csrf.guard.js';
import { PermissionsGuard } from '../auth/guards/permissions.guard.js';
class GuidanceDto {
  @IsObject() data!: Record<string, unknown>;
}
class ReferenceDto {
  @IsObject() data!: BrandReferenceInput;
}
class MediaDto {
  @IsString() @MaxLength(700000) base64!: string;
  @IsIn(['image/png', 'image/jpeg', 'image/webp']) mimeType!: string;
}
class ApprovalDto {
  @IsString() @MaxLength(64) digest!: string;
  @Equals(true) confirmed!: true;
}
class ReviewDto extends ApprovalDto {
  @ValidateIf((o: ReviewDto) => o.expectedReviewEventId !== null)
  @IsUUID()
  expectedReviewEventId!: string | null;
  @IsIn(['APPROVED', 'REJECTED', 'REVOKED']) decision!: 'APPROVED' | 'REJECTED' | 'REVOKED';
  @IsString() @MaxLength(1000) notes!: string;
  @IsBoolean() rightsConfirmed!: boolean;
}
@Controller({ path: 'brand/guidance', version: '1' })
@UseGuards(SessionAuthGuard, CsrfGuard, PermissionsGuard)
@RequirePermissions(Permission.VIEW_OWN_CONTENT)
export class BrandGuidanceController {
  constructor(private readonly guidance: BrandGuidanceService) {}
  @Get() list(
    @CurrentUser() actor: SanitizedEmployeeDto,
  ): ReturnType<BrandGuidanceService['list']> {
    return this.guidance.list(actor);
  }
  @Post()
  @RequirePermissions(Permission.ADMIN)
  create(
    @Body() dto: GuidanceDto,
    @CurrentUser() actor: SanitizedEmployeeDto,
  ): ReturnType<BrandGuidanceService['create']> {
    return this.guidance.create(dto.data, actor);
  }
  @Post(':id/approve')
  @RequirePermissions(Permission.ADMIN)
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApprovalDto,
    @CurrentUser() actor: SanitizedEmployeeDto,
  ): ReturnType<BrandGuidanceService['approve']> {
    return this.guidance.approve(id, dto.digest, actor);
  }
  @Get('references') references(
    @CurrentUser() actor: SanitizedEmployeeDto,
  ): ReturnType<BrandGuidanceService['references']> {
    return this.guidance.references(actor);
  }
  @Post('references')
  @RequirePermissions(Permission.ADMIN)
  source(
    @Body() dto: ReferenceDto,
    @CurrentUser() actor: SanitizedEmployeeDto,
  ): ReturnType<BrandGuidanceService['createReference']> {
    return this.guidance.createReference(dto.data, actor);
  }
  @Post('media')
  @RequirePermissions(Permission.ADMIN)
  media(
    @Body() dto: MediaDto,
    @CurrentUser() actor: SanitizedEmployeeDto,
  ): ReturnType<BrandGuidanceService['upload']> {
    return this.guidance.upload(Buffer.from(dto.base64, 'base64'), dto.mimeType, actor);
  }
  @Post('references/:id/review')
  @RequirePermissions(Permission.ADMIN)
  review(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewDto,
    @CurrentUser() actor: SanitizedEmployeeDto,
  ): ReturnType<BrandGuidanceService['reviewReference']> {
    return this.guidance.reviewReference(
      id,
      dto.digest,
      dto.decision,
      dto.notes,
      dto.rightsConfirmed,
      actor,
      dto.expectedReviewEventId,
    );
  }
  @Get('references/:id/image/:index')
  async image(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('index') index: string,
    @CurrentUser() actor: SanitizedEmployeeDto,
    @Res() res: Response,
  ): Promise<void> {
    const image = await this.guidance.image(id, Number(index), actor);
    res.setHeader('Content-Type', image.mimeType);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(image.buffer);
  }
}
