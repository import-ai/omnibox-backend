import { ResourceAttachmentsService } from './resource-attachments.service';

describe('resource attachment ID resolution', () => {
  const exact = { attachmentId: 'image' };
  const png = { attachmentId: 'image.png' };

  it.each([
    ['image', exact, [png], exact, undefined],
    ['image', null, [png], png, undefined],
    ['image', null, [], undefined, 'ATTACHMENT_NOT_FOUND'],
    ['image.jpg', null, [png], undefined, 'ATTACHMENT_NOT_FOUND'],
    ['', null, [png], undefined, 'ATTACHMENT_NOT_FOUND'],
    [
      'image',
      null,
      [png, { attachmentId: 'image.jpg' }],
      undefined,
      'ATTACHMENT_ID_AMBIGUOUS',
    ],
  ])(
    'resolves %j with exact=%j and candidates=%j',
    async (id, found, matches, expected, error) => {
      const repository = {
        findOne: jest.fn().mockResolvedValue(found),
        find: jest.fn().mockResolvedValue(matches),
      };
      const service = new ResourceAttachmentsService(
        repository as any,
        undefined as any,
        { t: (key: string) => key } as any,
        undefined as any,
        undefined as any,
        undefined as any,
      );
      const result = service.getResourceAttachmentOrFail(
        'namespace',
        'resource',
        id,
      );
      if (error) {
        await expect(result).rejects.toMatchObject({ code: error });
      } else {
        await expect(result).resolves.toBe(expected);
      }
      expect(repository.findOne).toHaveBeenCalledWith({
        where: {
          namespaceId: 'namespace',
          resourceId: 'resource',
          attachmentId: id,
        },
      });
      if (!found && id && !id.includes('.')) {
        const query = repository.find.mock.calls[0][0];
        expect(query).toMatchObject({
          where: { namespaceId: 'namespace', resourceId: 'resource' },
          take: 2,
        });
        expect(query.where.attachmentId.getSql('attachment_id')).toBe(
          "split_part(attachment_id, '.', 1) = :attachmentStem",
        );
        expect(query.where.attachmentId.objectLiteralParameters).toEqual({
          attachmentStem: id,
        });
      } else {
        expect(repository.find).not.toHaveBeenCalled();
      }
    },
  );
});
