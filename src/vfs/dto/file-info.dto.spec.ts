import { ResourceType } from 'omniboxd/resources/entities/resource.entity';
import { FileInfoDto } from 'omniboxd/vfs/dto/file-info.dto';

describe('FileInfoDto', () => {
  it('exposes smart folders as VFS folders', () => {
    expect(FileInfoDto.getType(ResourceType.SMART_FOLDER)).toBe(
      ResourceType.FOLDER,
    );
  });
});
