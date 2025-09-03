export class UpdateResourceReqDto {
  name?: string;
  parentId?: string;
  tagIds?: string[];
  content?: string;
  attrs?: Record<string, any>;
}
