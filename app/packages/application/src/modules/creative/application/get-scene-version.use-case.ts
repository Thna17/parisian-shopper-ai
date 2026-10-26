import { Inject, Injectable } from '@nestjs/common';
import {
  type CreativeSceneRecord,
  type CreativeSceneVersionRecord,
} from '../domain/scene/creative-scene.types.js';
import {
  CreativeSceneNotFoundError,
  CreativeSceneVersionNotFoundError,
} from '../domain/scene/creative-scene-errors.js';
import {
  CREATIVE_SCENE_REPOSITORY,
  type CreativeSceneRepository,
} from './creative-scene.repository.js';

@Injectable()
export class GetSceneVersionUseCase {
  public constructor(
    @Inject(CREATIVE_SCENE_REPOSITORY)
    private readonly sceneRepo: CreativeSceneRepository,
  ) {}

  public async getScene(sceneId: string): Promise<CreativeSceneRecord> {
    const scene = await this.sceneRepo.findById(sceneId);
    if (!scene) {
      throw new CreativeSceneNotFoundError(sceneId);
    }
    return scene;
  }

  public async getVersionById(versionId: string): Promise<CreativeSceneVersionRecord> {
    const version = await this.sceneRepo.findVersionById(versionId);
    if (!version) {
      throw new CreativeSceneVersionNotFoundError({ versionId });
    }
    return version;
  }

  public async getVersionByNumber(
    sceneId: string,
    versionNumber: number,
  ): Promise<CreativeSceneVersionRecord> {
    const version = await this.sceneRepo.findVersionByNumber(sceneId, versionNumber);
    if (!version) {
      throw new CreativeSceneVersionNotFoundError({ sceneId, versionNumber });
    }
    return version;
  }

  public async getLatestByJobId(creativeJobId: string): Promise<CreativeSceneVersionRecord> {
    const version = await this.sceneRepo.findLatestVersionByJobId(creativeJobId);
    if (!version) {
      throw new CreativeSceneVersionNotFoundError({ sceneId: `for-job:${creativeJobId}` });
    }
    return version;
  }

  public async getLatestBySceneId(sceneId: string): Promise<CreativeSceneVersionRecord> {
    const version = await this.sceneRepo.findLatestVersionBySceneId(sceneId);
    if (!version) {
      throw new CreativeSceneVersionNotFoundError({ sceneId });
    }
    return version;
  }

  public async listVersions(sceneId: string): Promise<readonly CreativeSceneVersionRecord[]> {
    const scene = await this.sceneRepo.findById(sceneId);
    if (!scene) {
      throw new CreativeSceneNotFoundError(sceneId);
    }
    return this.sceneRepo.listVersions(sceneId);
  }
}
