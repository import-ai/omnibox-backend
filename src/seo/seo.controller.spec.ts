import { HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { SeoController } from 'omniboxd/seo/seo.controller';
import { SeoService } from 'omniboxd/seo/seo.service';

describe('SeoController', () => {
  it('returns 404 HTML when a share does not exist', async () => {
    const service = new SeoService(
      { findOne: jest.fn().mockResolvedValue(null) } as never,
      {} as never,
      {} as never,
      { get: jest.fn() } as never,
    );
    const controller = new SeoController(service);
    const status = jest.fn().mockReturnThis();
    const send = jest.fn();
    const response = {
      setHeader: jest.fn(),
      status,
      send,
    } as unknown as Response;

    await controller.getShareSeoHtml('missing', response);

    expect(status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(send).toHaveBeenCalledWith(
      expect.stringContaining('No share found'),
    );
  });
});
