import { GenericContainer, StartedTestContainer } from 'testcontainers';

let postgresContainer: StartedTestContainer;
let minioContainer: StartedTestContainer;

// https://node.testcontainers.org/supported-container-runtimes
export default async () => {
  console.log('Setting up test containers...');
  postgresContainer = await new GenericContainer('postgres:17.5')
    .withExposedPorts(5432)
    .withEnvironment({
      POSTGRES_DB: 'omnibox',
      POSTGRES_USER: 'omnibox',
      POSTGRES_PASSWORD: 'omnibox',
    })
    .start();
  console.log('PostgreSQL container started');

  minioContainer = await new GenericContainer(
    'minio/minio:RELEASE.2025-04-22T22-12-26Z',
  )
    .withExposedPorts(9000)
    .withEnvironment({
      MINIO_ROOT_USER: 'minioadmin',
      MINIO_ROOT_PASSWORD: 'minioadmin',
    })
    .withCommand(['server', '/data'])
    .start();
  console.log('MinIO container started');

  const postgresUrl = `postgres://omnibox:omnibox@${postgresContainer.getHost()}:${postgresContainer.getMappedPort(5432)}/omnibox`;
  const minioUrl = `http://minioadmin:minioadmin@${minioContainer.getHost()}:${minioContainer.getMappedPort(9000)}/omnibox`;
  console.log(`PostgreSQL URL: ${postgresUrl}`);
  console.log(`MinIO URL: ${minioUrl}`);

  process.env.OBB_POSTGRES_URL = postgresUrl;
  process.env.OBB_MINIO_URL = minioUrl;
  process.env.OBB_DB_SYNC = 'false';
  process.env.OBB_DB_LOGGING = 'false';

  (global as any).__POSTGRES_CONTAINER__ = postgresContainer;
  (global as any).__MINIO_CONTAINER__ = minioContainer;
};
