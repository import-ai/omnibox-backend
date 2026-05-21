import { ResourceType } from 'omniboxd/resources/entities/resource.entity';

export interface SmartFolderCreateResourceInput {
  name?: string;
  parentId: string;
  resourceType: ResourceType;
  content?: string;
  attrs?: Record<string, any>;
  tag_ids?: string[];
}

export interface SmartFolderUpdateResourceInput {
  name?: string;
  parentId?: string;
  tag_ids?: string[];
  content?: string;
  attrs?: Record<string, any>;
}
