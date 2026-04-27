import { ResourceDto } from 'omniboxd/namespace-resources/dto/resource.dto';
import {
  SmartFolderCondition,
  SmartFolderConfig,
  SmartFolderMatchMode,
  SmartFolderRootScope,
} from 'omniboxd/smart-folders/entities/smart-folder-config.entity';

export class SmartFolderResponseDto {
  resource: ResourceDto;
  rootScope: SmartFolderRootScope;
  matchMode: SmartFolderMatchMode;
  conditions: SmartFolderCondition[];
  createdAt: string;
  updatedAt: string;

  static fromData(params: {
    resource: ResourceDto;
    config: SmartFolderConfig;
  }): SmartFolderResponseDto {
    const dto = new SmartFolderResponseDto();
    dto.resource = params.resource;
    dto.rootScope = params.config.rootScope;
    dto.matchMode = params.config.matchMode;
    dto.conditions = params.config.conditions;
    dto.createdAt = params.config.createdAt.toISOString();
    dto.updatedAt = params.config.updatedAt.toISOString();
    return dto;
  }
}
