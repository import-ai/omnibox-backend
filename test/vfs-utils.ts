import { TestClient } from 'test/test-client';
import { GetResponseDto } from 'omniboxd/vfs/dto/get.response.dto';
import { plainToInstance } from 'class-transformer';
import { VFSService } from 'omniboxd/vfs/vfs.service';
import { last } from 'omniboxd/utils/arrays';
import { FileInfoDto } from 'omniboxd/vfs/dto/file-info.dto';

async function getByPath(
  client: TestClient,
  path: string,
): Promise<GetResponseDto> {
  const response = await client
    .get(`/internal/api/v1/namespaces/${client.namespace.id}/vfs/content`)
    .query({ path })
    .expect(200);
  return plainToInstance(GetResponseDto, response.body);
}

export async function createResourceByPath(
  client: TestClient,
  path: string,
  content: string,
) {
  const response = await client
    .put(`/internal/api/v1/namespaces/${client.namespace.id}/vfs`)
    .send({ path, content })
    .expect(201);
  const parsedPath = VFSService.parsePath(path);
  const resourceName: string = last(parsedPath.resourceNames);
  const fileInfoDto = plainToInstance(FileInfoDto, response.body);
  expect(fileInfoDto.name).toEqual(resourceName);
  expect(fileInfoDto.path).toEqual(path);
  expect(fileInfoDto.isDir).toEqual(false);
  return { fileInfo: fileInfoDto, resource: await getByPath(client, path) };
}
