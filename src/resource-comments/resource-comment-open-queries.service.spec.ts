import { I18nService } from 'nestjs-i18n';
import { PermissionsService } from 'omniboxd/permissions/permissions.service';
import { Repository } from 'typeorm';

import {
  OpenCommentPageRequestDto,
  OpenListCommentThreadsRequestDto,
} from './dto/open-resource-comment-request.dto';
import { ResourceCommentThread } from './entities/resource-comment-thread.entity';
import { ResourceCommentOpenQueriesService } from './resource-comment-open-queries.service';

describe('Open comment query authorization', () => {
  it('never starts a read transaction after permission rejection', async () => {
    const transaction = jest.fn();
    const repository = {
      manager: { transaction },
    } as unknown as Repository<ResourceCommentThread>;
    const permissions = {
      userHasPermissionOrFail: jest.fn().mockRejectedValue(new Error('denied')),
    } as unknown as PermissionsService;
    const service = new ResourceCommentOpenQueriesService(
      repository,
      permissions,
      {} as I18nService,
    );
    await expect(
      service.listThreads(
        'namespace',
        'resource',
        'user',
        new OpenListCommentThreadsRequestDto(),
      ),
    ).rejects.toThrow('denied');
    await expect(
      service.listComments(
        'namespace',
        'resource',
        'thread',
        'user',
        new OpenCommentPageRequestDto(),
      ),
    ).rejects.toThrow('denied');
    expect(transaction).not.toHaveBeenCalled();
  });
});
