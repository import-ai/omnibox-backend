import { StartedTestContainer } from 'testcontainers';

// Global teardown function for Jest
export default async () => {
  console.log('Tearing down test containers...');

  const postgresContainer = (global as any)
    .__POSTGRES_CONTAINER__ as StartedTestContainer;
  const minioContainer = (global as any)
    .__MINIO_CONTAINER__ as StartedTestContainer;

  if (postgresContainer) {
    await postgresContainer.stop();
    console.log('PostgreSQL container stopped');
  }

  if (minioContainer) {
    await minioContainer.stop();
    console.log('MinIO container stopped');
  }

  console.log('Test containers teardown complete');
};
