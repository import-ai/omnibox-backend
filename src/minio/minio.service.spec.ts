import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { MinioService } from './minio.service';

describe('MinioService (integration, env config)', () => {
  let minioService: MinioService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [await ConfigModule.forRoot({ isGlobal: true })],
      providers: [MinioService],
    }).compile();
    minioService = module.get<MinioService>(MinioService);
  });

  it('should put and get an object', async () => {
    const objectName = 'test.txt';
    const content = Buffer.from('hello world');
    const mimetype = 'text/plain';

    await minioService.putObject(objectName, content, mimetype);
    const stream = await minioService.getObject(objectName);
    const data = await new Promise<string>((resolve, reject) => {
      let result = '';
      stream.on('data', (chunk) => (result += chunk.toString()));
      stream.on('end', () => resolve(result));
      stream.on('error', reject);
    });
    expect(data).toBe('hello world');
  });

  it('should get a presigned url', async () => {
    const objectName = 'test2.txt';
    const content = Buffer.from('presigned url test');
    const mimetype = 'text/plain';
    await minioService.putObject(objectName, content, mimetype);
    const url = await minioService.getObjectUrl(objectName);
    const res = await fetch(url);
    const text = await res.text();
    expect(text).toBe('presigned url test');
  });
});
