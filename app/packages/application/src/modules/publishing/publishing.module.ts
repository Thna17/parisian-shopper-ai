import { Module } from '@nestjs/common';
import { CreatePublicationUseCase } from './application/create-publication.use-case.js';
import { ConfirmPublicationUseCase } from './application/confirm-publication.use-case.js';
import { RetryPublicationUseCase } from './application/retry-publication.use-case.js';
import { CancelPublicationUseCase } from './application/cancel-publication.use-case.js';
import { ListPublicationsUseCase } from './application/list-publications.use-case.js';
import { GetPublicationDetailUseCase } from './application/get-publication-detail.use-case.js';
import { ListEligibleAssetsUseCase } from './application/list-eligible-assets.use-case.js';
import { ListDestinationsUseCase } from './application/list-destinations.use-case.js';

@Module({
  providers: [
    CreatePublicationUseCase,
    ConfirmPublicationUseCase,
    RetryPublicationUseCase,
    CancelPublicationUseCase,
    ListPublicationsUseCase,
    GetPublicationDetailUseCase,
    ListEligibleAssetsUseCase,
    ListDestinationsUseCase,
  ],
  exports: [
    CreatePublicationUseCase,
    ConfirmPublicationUseCase,
    RetryPublicationUseCase,
    CancelPublicationUseCase,
    ListPublicationsUseCase,
    GetPublicationDetailUseCase,
    ListEligibleAssetsUseCase,
    ListDestinationsUseCase,
  ],
})
export class PublishingModule {}
