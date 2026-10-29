import { Injectable } from '@nestjs/common';
import { Permission } from '../../auth/domain/permissions.js';
import { CHANNEL_CAPABILITIES, type ChannelCapability } from '../domain/publication.types.js';
import { InsufficientPublishingPermissionError } from '../domain/publishing-errors.js';

export interface ListDestinationsInput {
  readonly permissions: readonly string[];
}

@Injectable()
export class ListDestinationsUseCase {
  public execute(input: ListDestinationsInput): readonly ChannelCapability[] {
    const hasPerm =
      input.permissions.includes(Permission.VIEW_OWN_CONTENT) ||
      input.permissions.includes(Permission.VIEW_ALL_CONTENT) ||
      input.permissions.includes(Permission.PUBLISH_CREATIVE);

    if (!hasPerm) {
      throw new InsufficientPublishingPermissionError();
    }

    return CHANNEL_CAPABILITIES;
  }
}
