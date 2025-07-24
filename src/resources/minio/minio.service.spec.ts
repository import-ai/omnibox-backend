import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { MinioService } from 'omnibox-backend/resources/minio/minio.service';

export const base64img: string =
  'iVBORw0KGgoAAAANSUhEUgAAAB4AAAAkCAYAAACe0YppAAAAAXNSR0IArs4c6QAAAGxlWElmTU0AKgAAAAgABAEaAAUAAAABAAAAPgEbAAUAAAABAAAARgEoAAMAAAABAAIAAIdpAAQAAAABAAAATgAAAAAAAACQAAAAAQAAAJAAAAABAAKgAgAEAAAAAQAAAB6gAwAEAAAAAQAAACQAAAAAS/p+JAAAAAlwSFlzAAAWJQAAFiUBSVIk8AAAAzdJREFUWAmlWE1LMlEUPpotKgwDQUGoEIIgpEW0UBFBxITatGzfH+j/tGwZtO8LiihRgsCQaGeLIFoUpVJQ+fYM3cv9ODNzezube+85zz3Pc8Yzd2aMzMzMDMnRRkZGKJFIWOivry96enqy/EGOWFDQjG1sbND6+rrp9tabm5u/Io+yWXyc+XzeJ0K0urrqG+MCzsSjo6OUSqW4HJ4vSBS3yZm4Wq1SJBLhcng+iII4V3MmLpfLgTkhCuJczZk4m82G5gwTpyZwIl5aWiLcSqpdX1/Tx8eH6iIXcWKDE3GtVhN4OZ6dnVG325VrTCAOIl3MiXhhYUHLNRwO6fT0lC4uLjQ/FpxIC/TtCCWenp6msbExbS9Oqff3dzo6OtL8WJgiLcCPI5SYOxiurq687S8vL/T6+qrlhkiIDbNQYu43UyvtdDoWByfWBAUST05O0tTUlLYHnXxzcyN9x8fHci4mnFgRE2Mgcb1eFzg5mp18eXlJaDbVIBaigyyQuFgsWnvNTgbp/f29heNEqyBfYtyTmUxGxXpz9fcVwWazKaZy5ETL4PfElxjHn/lQQAejk007ODgwXZ5o87RTQb7ElUpFxXlzroMReHh4oLe3Nw0P0UFnty/x3NyclggLroMF6Pb2VkzlyIkXQZY4l8tRLKa/FaGJ0MF+hiPUNE68wLDEXEeic83bRiTBiIeGGYd4FMGZXtYPggOjw3d3d7kc0mc2IwIoot1uS4yYWMTpdJomJiZEXBu5xBqAWXBFAGZd6rW1NWb7/7tQBIoxzSJeXl42MX9ec8Vol3p8fJySyaRFtLe3R4+Pj5afc+BFYHZ2VguhmO3tbc2nEa+srGhBLD4/P2lnZ8fy+zn6/T5tbW1pYRSDogaDgfRrl7pUKsmAmNzd3Ymp03h+fm7dVthoFiWJo9Eo++bQaDScCAUIH3A4Qk0zi5LEhULBeihg8+HhoZkjdN1qtSwMXofU21ESc18BvV6Pnp+frSRhjv39fQsCUvVRKYnn5+ctsPqKYwUDHDhe8RZqmlqcRwxS7oPr5OTE3Ou85p5WanEe8eLiopUQB/5vG0tNwolGcfF43INFfvNXhJr4r/N/ctvrkhk6znEAAAAASUVORK5CYII=';

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
    await minioService.removeObject(objectName);
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
    await minioService.removeObject(objectName);
  });

  it('should put and get a jpeg image', async () => {
    const objectName = 'test_image.jpg';
    const content = Buffer.from(base64img, 'base64');
    const requestMimetype = 'image/jpeg';
    await minioService.putObject(objectName, content, requestMimetype);
    const stream = await minioService.getObject(objectName);

    const base64 = await new Promise<string>((resolve, reject) => {
      let result = '';
      stream.on('data', (chunk) => (result += chunk.toString('base64')));
      stream.on('end', () => resolve(result));
      stream.on('error', reject);
    });

    expect(base64).toBe(base64img);
    await minioService.removeObject(objectName);
  });
});
