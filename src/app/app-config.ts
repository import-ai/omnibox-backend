import { ConsoleLogger, INestApplication, LogLevel } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as express from 'express';
import * as cookieParser from 'cookie-parser';
import { OpenAPIModule } from 'omniboxd/open-api/open-api.module';

function setupOpenAPISwagger(app: INestApplication): INestApplication {
  const config = new DocumentBuilder()
    .setTitle('OmniBox Open API')
    .setDescription('Public API for OmniBox integration')
    .setVersion('1.0')
    .addApiKey(
      { type: 'apiKey', name: 'Authorization', in: 'header' },
      'api-key',
    )
    .build();

  const documentFactory = () => {
    const doc = SwaggerModule.createDocument(app, config, {
      include: [OpenAPIModule],
    });

    doc.paths = Object.fromEntries(
      Object.entries(doc.paths).map(([path, pathConfig]) => {
        const newPath = path.replace('/open/api', '');
        return [newPath, pathConfig];
      }),
    );
    return doc;
  };

  SwaggerModule.setup('open/api/docs', app, documentFactory);

  return app;
}

function setupSwagger(app: INestApplication): INestApplication {
  const config = new DocumentBuilder()
    .setTitle('OmniBox Backend API')
    .setDescription('Backend API for OmniBox')
    .setVersion('1.0')
    .addApiKey({ type: 'apiKey', name: 'token', in: 'header' }, 'token')
    .build();

  const documentFactory = () => SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, documentFactory);

  return app;
}

export function configureApp(app: INestApplication): INestApplication {
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ limit: '10mb', extended: true }));
  app.use(cookieParser());

  const configService = app.get(ConfigService);
  const logLevels: LogLevel[] = configService
    .get('OBB_LOG_LEVELS', 'error,warn,log')
    .split(',');
  const logger = new ConsoleLogger({ json: true, logLevels });
  app.useLogger(logger);

  setupSwagger(app);
  setupOpenAPISwagger(app);

  return app;
}
