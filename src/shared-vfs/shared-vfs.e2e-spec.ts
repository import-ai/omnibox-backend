import { plainToInstance } from 'class-transformer';
import { ResourceType } from 'omniboxd/resources/entities/resource.entity';
import { SharedVfsResourceResponseDto } from 'omniboxd/shared-vfs/dto/shared-vfs.resource.response.dto';
import { FilterResponseDto } from 'omniboxd/vfs/dto/filter.response.dto';
import { GetResponseDto } from 'omniboxd/vfs/dto/get.response.dto';
import { ListResponseDto } from 'omniboxd/vfs/dto/list.response.dto';
import { TestClient } from 'test/test-client';

async function createResource(
  client: TestClient,
  params: {
    name: string;
    resourceType: ResourceType;
    parentId: string;
    content: string;
  },
): Promise<string> {
  const response = await client
    .post(`/api/v1/namespaces/${client.namespace.id}/resources`)
    .send({
      name: params.name,
      namespaceId: client.namespace.id,
      resourceType: params.resourceType,
      parentId: params.parentId,
      content: params.content,
    })
    .expect(201);
  expect(response.body.id).toBeDefined();
  return response.body.id;
}

describe('SharedVFS (e2e)', () => {
  let client: TestClient;

  beforeAll(async () => {
    client = await TestClient.create();
  });

  afterAll(async () => {
    await client.close();
  });

  it('lists / and /share after sharing a root file', async () => {
    const fileName = `shared-root-file-${Date.now()}`;
    const fileId = await createResource(client, {
      name: fileName,
      resourceType: ResourceType.DOC,
      parentId: client.namespace.root_resource_id,
      content: 'shared file content',
    });

    const shareResponse = await client
      .patch(
        `/api/v1/namespaces/${client.namespace.id}/resources/${fileId}/share`,
      )
      .send({ enabled: true, password: null })
      .expect(200);
    const shareId = shareResponse.body.id;
    expect(shareId).toBeDefined();

    const rootListResponse = await client
      .get(`/internal/api/v1/shares/${shareId}/vfs/list`)
      .query({ path: '/' })
      .expect(200);
    const rootList = plainToInstance(ListResponseDto, rootListResponse.body);
    expect(rootList.parentPath).toEqual('/');
    expect(rootList.total).toEqual(1);
    expect(rootList.resources).toHaveLength(1);
    expect(rootList.resources[0].id).toEqual('share-root');
    expect(rootList.resources[0].name).toEqual('share');
    expect(rootList.resources[0].path).toEqual('/share');

    const shareListResponse = await client
      .get(`/internal/api/v1/shares/${shareId}/vfs/list`)
      .query({ path: '/share' })
      .expect(200);
    const shareList = plainToInstance(ListResponseDto, shareListResponse.body);
    expect(shareList.parentPath).toEqual('/share');
    expect(shareList.total).toEqual(1);
    expect(shareList.resources).toHaveLength(1);
    expect(shareList.resources[0].id).toEqual(fileId);
    expect(shareList.resources[0].name).toEqual(fileName);
    expect(shareList.resources[0].path).toEqual(`/share/${fileName}`);

    const contentResponse = await client
      .get(`/internal/api/v1/shares/${shareId}/vfs/content`)
      .query({ path: `/share/${fileName}` })
      .expect(200);
    const contentDto = plainToInstance(GetResponseDto, contentResponse.body);
    expect(contentDto.path).toEqual(`/share/${fileName}`);
    expect(contentDto.content).toEqual('shared file content');

    const getResponse = await client
      .get(`/internal/api/v1/shares/${shareId}/vfs`)
      .query({ path: `/share/${fileName}` })
      .expect(200);
    const getDto = plainToInstance(
      SharedVfsResourceResponseDto,
      getResponse.body,
    );
    expect(getDto.vfsName).toEqual(fileName);
    expect(getDto.vfsPath).toEqual(`/share/${fileName}`);
    expect(getDto.content).toEqual('shared file content');

    const pathResponse = await client
      .get(`/internal/api/v1/shares/${shareId}/vfs/path`)
      .query({ resource_id: fileId })
      .expect(200);
    expect(pathResponse.body.path).toEqual(`/share/${fileName}`);

    const filterResponse = await client
      .get(`/internal/api/v1/shares/${shareId}/vfs/filter`)
      .query({
        path: '/share',
        options: JSON.stringify({ name_pattern: 'shared-root-file' }),
      })
      .expect(200);
    const filterDto = plainToInstance(FilterResponseDto, filterResponse.body);
    expect(filterDto.total).toBeGreaterThanOrEqual(1);
    expect(
      filterDto.resources.some(
        (resource) =>
          resource.name === fileName && resource.path === `/share/${fileName}`,
      ),
    ).toBeTruthy();
  });

  it('creates nested resources and shares folder-1', async () => {
    // Resource tree under namespace root:
    // folder-1
    // ├── folder-2
    // │   ├── file-5
    // │   └── file-6
    // ├── file-3
    // └── file-4
    const suffix = `${Date.now()}`;
    const folder1Name = `folder-1-${suffix}`;
    const folder2Name = `folder-2-${suffix}`;
    const file3Name = `file-3-${suffix}`;
    const file4Name = `file-4-${suffix}`;
    const file5Name = `file-5-${suffix}`;
    const file6Name = `file-6-${suffix}`;

    const folder1Id = await createResource(client, {
      name: folder1Name,
      resourceType: ResourceType.FOLDER,
      parentId: client.namespace.root_resource_id,
      content: '',
    });

    const folder2Id = await createResource(client, {
      name: folder2Name,
      resourceType: ResourceType.FOLDER,
      parentId: folder1Id,
      content: '',
    });

    const file3Id = await createResource(client, {
      name: file3Name,
      resourceType: ResourceType.DOC,
      parentId: folder1Id,
      content: 'content of file-3',
    });

    const file4Id = await createResource(client, {
      name: file4Name,
      resourceType: ResourceType.DOC,
      parentId: folder1Id,
      content: 'content of file-4',
    });

    const file5Id = await createResource(client, {
      name: file5Name,
      resourceType: ResourceType.DOC,
      parentId: folder2Id,
      content: 'content of file-5',
    });

    const file6Id = await createResource(client, {
      name: file6Name,
      resourceType: ResourceType.DOC,
      parentId: folder2Id,
      content: 'content of file-6',
    });

    const shareResponse = await client
      .patch(
        `/api/v1/namespaces/${client.namespace.id}/resources/${folder1Id}/share`,
      )
      .send({ enabled: true, password: null, all_resources: true })
      .expect(200);
    const shareId = shareResponse.body.id;
    expect(shareId).toBeDefined();

    const rootListResponse = await client
      .get(`/internal/api/v1/shares/${shareId}/vfs/list`)
      .query({ path: '/' })
      .expect(200);
    const rootList = plainToInstance(ListResponseDto, rootListResponse.body);
    expect(rootList.parentPath).toEqual('/');
    expect(rootList.total).toEqual(1);
    expect(rootList.resources).toHaveLength(1);
    expect(rootList.resources[0].name).toEqual('share');

    const shareListResponse = await client
      .get(`/internal/api/v1/shares/${shareId}/vfs/list`)
      .query({ path: '/share' })
      .expect(200);
    const shareList = plainToInstance(ListResponseDto, shareListResponse.body);
    expect(shareList.parentPath).toEqual('/share');
    expect(shareList.total).toEqual(1);
    expect(shareList.resources).toHaveLength(1);
    expect(shareList.resources[0].id).toEqual(folder1Id);
    expect(shareList.resources[0].name).toEqual(folder1Name);

    const folder1ListResponse = await client
      .get(`/internal/api/v1/shares/${shareId}/vfs/list`)
      .query({ path: `/share/${folder1Name}` })
      .expect(200);
    const folder1List = plainToInstance(
      ListResponseDto,
      folder1ListResponse.body,
    );
    expect(folder1List.parentPath).toEqual(`/share/${folder1Name}`);
    expect(folder1List.total).toEqual(3);
    expect(
      folder1List.resources.some(
        (resource) =>
          resource.id === folder2Id && resource.name === folder2Name,
      ),
    ).toBeTruthy();
    expect(
      folder1List.resources.some(
        (resource) => resource.id === file3Id && resource.name === file3Name,
      ),
    ).toBeTruthy();
    expect(
      folder1List.resources.some(
        (resource) => resource.id === file4Id && resource.name === file4Name,
      ),
    ).toBeTruthy();

    const folder2ListResponse = await client
      .get(`/internal/api/v1/shares/${shareId}/vfs/list`)
      .query({ path: `/share/${folder1Name}/${folder2Name}` })
      .expect(200);
    const folder2List = plainToInstance(
      ListResponseDto,
      folder2ListResponse.body,
    );
    expect(folder2List.parentPath).toEqual(
      `/share/${folder1Name}/${folder2Name}`,
    );
    expect(folder2List.total).toEqual(2);
    expect(
      folder2List.resources.some(
        (resource) => resource.id === file5Id && resource.name === file5Name,
      ),
    ).toBeTruthy();
    expect(
      folder2List.resources.some(
        (resource) => resource.id === file6Id && resource.name === file6Name,
      ),
    ).toBeTruthy();

    const file3ContentResponse = await client
      .get(`/internal/api/v1/shares/${shareId}/vfs/content`)
      .query({ path: `/share/${folder1Name}/${file3Name}` })
      .expect(200);
    const file3Content = plainToInstance(
      GetResponseDto,
      file3ContentResponse.body,
    );
    expect(file3Content.id).toEqual(file3Id);
    expect(file3Content.path).toEqual(`/share/${folder1Name}/${file3Name}`);
    expect(file3Content.content).toEqual('content of file-3');

    const file4ContentResponse = await client
      .get(`/internal/api/v1/shares/${shareId}/vfs/content`)
      .query({ path: `/share/${folder1Name}/${file4Name}` })
      .expect(200);
    const file4Content = plainToInstance(
      GetResponseDto,
      file4ContentResponse.body,
    );
    expect(file4Content.id).toEqual(file4Id);
    expect(file4Content.path).toEqual(`/share/${folder1Name}/${file4Name}`);
    expect(file4Content.content).toEqual('content of file-4');

    const file5ContentResponse = await client
      .get(`/internal/api/v1/shares/${shareId}/vfs/content`)
      .query({ path: `/share/${folder1Name}/${folder2Name}/${file5Name}` })
      .expect(200);
    const file5Content = plainToInstance(
      GetResponseDto,
      file5ContentResponse.body,
    );
    expect(file5Content.id).toEqual(file5Id);
    expect(file5Content.path).toEqual(
      `/share/${folder1Name}/${folder2Name}/${file5Name}`,
    );
    expect(file5Content.content).toEqual('content of file-5');

    const file6ContentResponse = await client
      .get(`/internal/api/v1/shares/${shareId}/vfs/content`)
      .query({ path: `/share/${folder1Name}/${folder2Name}/${file6Name}` })
      .expect(200);
    const file6Content = plainToInstance(
      GetResponseDto,
      file6ContentResponse.body,
    );
    expect(file6Content.id).toEqual(file6Id);
    expect(file6Content.path).toEqual(
      `/share/${folder1Name}/${folder2Name}/${file6Name}`,
    );
    expect(file6Content.content).toEqual('content of file-6');

    const file3GetResponse = await client
      .get(`/internal/api/v1/shares/${shareId}/vfs`)
      .query({ path: `/share/${folder1Name}/${file3Name}` })
      .expect(200);
    const file3Get = plainToInstance(
      SharedVfsResourceResponseDto,
      file3GetResponse.body,
    );
    expect(file3Get.id).toEqual(file3Id);
    expect(file3Get.vfsName).toEqual(file3Name);
    expect(file3Get.vfsPath).toEqual(`/share/${folder1Name}/${file3Name}`);
    expect(file3Get.content).toEqual('content of file-3');

    const file4GetResponse = await client
      .get(`/internal/api/v1/shares/${shareId}/vfs`)
      .query({ path: `/share/${folder1Name}/${file4Name}` })
      .expect(200);
    const file4Get = plainToInstance(
      SharedVfsResourceResponseDto,
      file4GetResponse.body,
    );
    expect(file4Get.id).toEqual(file4Id);
    expect(file4Get.vfsName).toEqual(file4Name);
    expect(file4Get.vfsPath).toEqual(`/share/${folder1Name}/${file4Name}`);
    expect(file4Get.content).toEqual('content of file-4');

    const file5GetResponse = await client
      .get(`/internal/api/v1/shares/${shareId}/vfs`)
      .query({ path: `/share/${folder1Name}/${folder2Name}/${file5Name}` })
      .expect(200);
    const file5Get = plainToInstance(
      SharedVfsResourceResponseDto,
      file5GetResponse.body,
    );
    expect(file5Get.id).toEqual(file5Id);
    expect(file5Get.vfsName).toEqual(file5Name);
    expect(file5Get.vfsPath).toEqual(
      `/share/${folder1Name}/${folder2Name}/${file5Name}`,
    );
    expect(file5Get.content).toEqual('content of file-5');

    const file6GetResponse = await client
      .get(`/internal/api/v1/shares/${shareId}/vfs`)
      .query({ path: `/share/${folder1Name}/${folder2Name}/${file6Name}` })
      .expect(200);
    const file6Get = plainToInstance(
      SharedVfsResourceResponseDto,
      file6GetResponse.body,
    );
    expect(file6Get.id).toEqual(file6Id);
    expect(file6Get.vfsName).toEqual(file6Name);
    expect(file6Get.vfsPath).toEqual(
      `/share/${folder1Name}/${folder2Name}/${file6Name}`,
    );
    expect(file6Get.content).toEqual('content of file-6');

    const folder1PathResponse = await client
      .get(`/internal/api/v1/shares/${shareId}/vfs/path`)
      .query({ resource_id: folder1Id })
      .expect(200);
    expect(folder1PathResponse.body.path).toEqual(`/share/${folder1Name}`);

    const folder2PathResponse = await client
      .get(`/internal/api/v1/shares/${shareId}/vfs/path`)
      .query({ resource_id: folder2Id })
      .expect(200);
    expect(folder2PathResponse.body.path).toEqual(
      `/share/${folder1Name}/${folder2Name}`,
    );

    const file3PathResponse = await client
      .get(`/internal/api/v1/shares/${shareId}/vfs/path`)
      .query({ resource_id: file3Id })
      .expect(200);
    expect(file3PathResponse.body.path).toEqual(
      `/share/${folder1Name}/${file3Name}`,
    );

    const file4PathResponse = await client
      .get(`/internal/api/v1/shares/${shareId}/vfs/path`)
      .query({ resource_id: file4Id })
      .expect(200);
    expect(file4PathResponse.body.path).toEqual(
      `/share/${folder1Name}/${file4Name}`,
    );

    const file5PathResponse = await client
      .get(`/internal/api/v1/shares/${shareId}/vfs/path`)
      .query({ resource_id: file5Id })
      .expect(200);
    expect(file5PathResponse.body.path).toEqual(
      `/share/${folder1Name}/${folder2Name}/${file5Name}`,
    );

    const file6PathResponse = await client
      .get(`/internal/api/v1/shares/${shareId}/vfs/path`)
      .query({ resource_id: file6Id })
      .expect(200);
    expect(file6PathResponse.body.path).toEqual(
      `/share/${folder1Name}/${folder2Name}/${file6Name}`,
    );

    const folder2FilterByNameResponse = await client
      .get(`/internal/api/v1/shares/${shareId}/vfs/filter`)
      .query({
        path: `/share/${folder1Name}/${folder2Name}`,
        options: JSON.stringify({ name_pattern: 'file-' }),
      })
      .expect(200);
    const folder2FilterByName = plainToInstance(
      FilterResponseDto,
      folder2FilterByNameResponse.body,
    );
    expect(folder2FilterByName.total).toEqual(2);
    expect(
      folder2FilterByName.resources.some(
        (resource) =>
          resource.id === file5Id &&
          resource.path === `/share/${folder1Name}/${folder2Name}/${file5Name}`,
      ),
    ).toBeTruthy();
    expect(
      folder2FilterByName.resources.some(
        (resource) =>
          resource.id === file6Id &&
          resource.path === `/share/${folder1Name}/${folder2Name}/${file6Name}`,
      ),
    ).toBeTruthy();

    const folder1FilterByNameResponse = await client
      .get(`/internal/api/v1/shares/${shareId}/vfs/filter`)
      .query({
        path: `/share/${folder1Name}`,
        options: JSON.stringify({ name_pattern: file5Name }),
      })
      .expect(200);
    const folder1FilterByName = plainToInstance(
      FilterResponseDto,
      folder1FilterByNameResponse.body,
    );
    expect(folder1FilterByName.total).toEqual(1);
    expect(folder1FilterByName.resources[0].id).toEqual(file5Id);
    expect(folder1FilterByName.resources[0].path).toEqual(
      `/share/${folder1Name}/${folder2Name}/${file5Name}`,
    );

    const folder1FilterByContentResponse = await client
      .get(`/internal/api/v1/shares/${shareId}/vfs/filter`)
      .query({
        path: `/share/${folder1Name}`,
        options: JSON.stringify({ content_pattern: 'file-6' }),
      })
      .expect(200);
    const folder1FilterByContent = plainToInstance(
      FilterResponseDto,
      folder1FilterByContentResponse.body,
    );
    expect(folder1FilterByContent.total).toEqual(1);
    expect(folder1FilterByContent.resources[0].id).toEqual(file6Id);
    expect(folder1FilterByContent.resources[0].path).toEqual(
      `/share/${folder1Name}/${folder2Name}/${file6Name}`,
    );
  });
});
