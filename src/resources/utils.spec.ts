import { Resource, ResourceType } from 'src/resources/resources.entity';
import { embedImage } from 'src/resources/utils';
import { base64img } from 'src/resources/minio/minio.service.spec';

describe('resources/utils', () => {
  const resource: Resource = {
    id: 'id1',
    namespaceId: 'namespace1',
    userId: 'user1',
    parentId: null,
    name: 'image1',
    resourceType: ResourceType.FILE,
    tags: [],
    content: '![image1](foo.jpg).',
    attrs: {
      images: {
        'foo.jpg': base64img,
      },
    },
    globalPermission: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  it('test embedImage', () => {
    const embedResource = embedImage(resource);
    expect(embedResource.content).toBe(
      `![image1](data:image/jpeg;base64,${base64img}').`,
    );
  });
});
