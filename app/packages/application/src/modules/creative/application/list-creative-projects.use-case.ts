import { Inject, Injectable, Optional } from '@nestjs/common';
import { ForbiddenError } from '@parisian-shopper/common';
import { Permission, PermissionService } from '../../auth/domain/permissions.js';
import {
  CREATIVE_SCENE_REPOSITORY,
  type CreativeSceneRepository,
  type ListCreativeScenesQuery,
  type PaginatedCreativeScenes,
} from './creative-scene.repository.js';

export interface ListCreativeProjectsInput {
  readonly requesterUserId: string;
  readonly requesterRoles: readonly string[];
  readonly query: ListCreativeScenesQuery;
}

@Injectable()
export class ListCreativeProjectsUseCase {
  private readonly permissions: PermissionService;

  public constructor(
    @Inject(CREATIVE_SCENE_REPOSITORY)
    private readonly sceneRepo: CreativeSceneRepository,
    @Optional()
    @Inject(PermissionService)
    permissions?: PermissionService,
  ) {
    this.permissions = permissions ?? new PermissionService();
  }

  public async execute(input: ListCreativeProjectsInput): Promise<PaginatedCreativeScenes> {
    const hasAccess =
      this.permissions.hasAnyRolePermission(input.requesterRoles, Permission.VIEW_OWN_CONTENT) ||
      this.permissions.hasAnyRolePermission(input.requesterRoles, Permission.VIEW_ALL_CONTENT) ||
      this.permissions.hasAnyRolePermission(input.requesterRoles, Permission.EDIT_CREATIVE);

    if (!hasAccess) {
      throw new ForbiddenError({
        publicMessage: 'Permission denied: Cannot view creative projects.',
      });
    }

    return this.sceneRepo.findScenes(input.query);
  }
}
