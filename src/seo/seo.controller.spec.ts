import { HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { SeoController } from 'omniboxd/seo/seo.controller';
import { SeoService } from 'omniboxd/seo/seo.service';

describe('SeoController', () => {
  it('returns 404 HTML when a share does not exist', async () => {
    const service = new SeoService(
      { findOne: jest.fn().mockResolvedValue(null) } as never,
      {} as never,
      {} as never,
      {} as never,
      { get: jest.fn() } as never,
    );
    const controller = new SeoController(service);
    const setHeader = jest.fn();
    const status = jest.fn().mockReturnThis();
    const send = jest.fn();
    const response = {
      setHeader,
      status,
      send,
    } as unknown as Response;

    await controller.getShareSeoHtml('missing', response);

    expect(status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(send).toHaveBeenCalledWith(
      expect.stringContaining('No share found'),
    );
  });

  it('does not expose a resource outside the share scope', async () => {
    const getAndValidateResource = jest
      .fn()
      .mockRejectedValue(
        new AppException(
          'Resource not found',
          'RESOURCE_NOT_FOUND',
          HttpStatus.NOT_FOUND,
        ),
      );
    const service = new SeoService(
      {
        findOne: jest.fn().mockResolvedValue({
          id: 'share-id',
          enabled: true,
          userId: 'owner-id',
          expiresAt: null,
          requireLogin: false,
          password: null,
          resourceId: 'root-resource-id',
        }),
      } as never,
      {} as never,
      {} as never,
      { getAndValidateResource } as never,
      { get: jest.fn() } as never,
    );

    const result = await service.generateShareHtml(
      'share-id',
      'private-resource-id',
    );

    expect(getAndValidateResource).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'share-id' }),
      'private-resource-id',
    );
    expect(result.status).toBe(HttpStatus.NOT_FOUND);
  });

  describe.each([
    ['the share root', null],
    ['a named resource', 'doc-resource-id'],
  ])('a chat-only share, requesting %s', (_label, requestedResourceId) => {
    function buildService(shareType: string) {
      const getAndValidateResource = jest.fn().mockResolvedValue({
        id: 'doc-resource-id',
        name: 'Secret roadmap',
        content: 'The launch slips to Q4.',
      });
      const service = new SeoService(
        {
          findOne: jest.fn().mockResolvedValue({
            id: 'share-id',
            enabled: true,
            userId: 'owner-id',
            expiresAt: null,
            requireLogin: false,
            password: null,
            resourceId: 'root-resource-id',
            shareType,
          }),
        } as never,
        {} as never,
        {} as never,
        { getAndValidateResource } as never,
        { get: jest.fn() } as never,
      );
      return { service, getAndValidateResource };
    }

    it('leaks neither the resource name nor its content', async () => {
      const { service, getAndValidateResource } = buildService('chat_only');

      const result = await service.generateShareHtml(
        'share-id',
        requestedResourceId,
      );

      expect(result.status).toBe(HttpStatus.OK);
      expect(result.html).toContain('This share does not display resources');
      expect(result.html).not.toContain('Secret roadmap');
      expect(result.html).not.toContain('The launch slips to Q4.');
      // The guard runs before the read, so the resource is never loaded.
      expect(getAndValidateResource).not.toHaveBeenCalled();
    });

    it.each(['all', 'doc_only'])(
      'still renders a %s share, so the guard is share-type driven',
      async (shareType) => {
        const { service, getAndValidateResource } = buildService(shareType);

        const result = await service.generateShareHtml(
          'share-id',
          requestedResourceId,
        );

        expect(getAndValidateResource).toHaveBeenCalled();
        expect(result.html).toContain('Secret roadmap');
      },
    );
  });

  it('does not treat an indexed option value of false as public', async () => {
    const service = new SeoService(
      {} as never,
      {
        findOne: jest.fn().mockResolvedValue({
          id: 'resource-id',
          name: 'Private resource',
          content: 'private content',
          userId: 'owner-id',
        }),
      } as never,
      { findOne: jest.fn().mockResolvedValue({ value: 'false' }) } as never,
      {} as never,
      { get: jest.fn() } as never,
    );

    const result = await service.getResourceHtml('namespace-id', 'resource-id');

    expect(result.status).toBe(HttpStatus.OK);
    expect(result.html).toContain('This content is protected');
    expect(result.html).not.toContain('private content');
  });
});
