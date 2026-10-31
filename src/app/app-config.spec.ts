import { ConsoleLogger, INestApplication, LogLevel } from '@nestjs/common';
import { SwaggerModule } from '@nestjs/swagger';

import { configureApp } from './app-config';

jest.mock('omniboxd/open-api/open-api.module', () => ({
  OpenAPIModule: class {},
}));

describe('application log levels', () => {
  beforeEach(() => {
    jest.spyOn(SwaggerModule, 'setup').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it.each([
    { label: 'empty', value: '', enabled: [] },
    { label: 'whitespace', value: ' , ', enabled: [] },
    {
      label: 'default',
      value: undefined,
      enabled: ['log', 'warn', 'error', 'fatal'],
    },
    { label: 'error only', value: 'error', enabled: ['error', 'fatal'] },
    {
      label: 'trimmed levels',
      value: ' warn, error, ',
      enabled: ['warn', 'error', 'fatal'],
    },
  ])('respects $label configuration', ({ value, enabled }) => {
    const app = {
      use: jest.fn(),
      get: jest.fn().mockReturnValue({
        get: (_key: string, fallback: string) => value ?? fallback,
      }),
      useLogger: jest.fn(),
    };

    configureApp(app as unknown as INestApplication);

    const logger = app.useLogger.mock.calls[0][0] as ConsoleLogger;
    const levels: LogLevel[] = [
      'verbose',
      'debug',
      'log',
      'warn',
      'error',
      'fatal',
    ];
    for (const level of levels) {
      expect(logger.isLevelEnabled(level)).toBe(enabled.includes(level));
    }
  });
});
