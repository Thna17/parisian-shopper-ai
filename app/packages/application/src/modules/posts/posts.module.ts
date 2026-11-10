import { BrandGuidanceModule } from '../brand/brand-guidance.module.js';
import { PostCaptionService } from './post-caption.service.js';
import { PostGenerationCommands } from './post-generation.commands.js';
import { Module } from '@nestjs/common';
import { ProductsModule } from '../products/products.module.js';
import { CreativeModule } from '../creative/creative.module.js';
import { PostWorkflowService } from './post-workflow.service.js';
@Module({
  imports: [ProductsModule, CreativeModule, BrandGuidanceModule],
  providers: [PostWorkflowService, PostGenerationCommands, PostCaptionService],
  exports: [PostWorkflowService, PostGenerationCommands, PostCaptionService],
})
export class PostsModule {}
