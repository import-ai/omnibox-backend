import { StartedTestContainer } from 'testcontainers';

// Global teardown function for Jest
export default async () => {
  console.log('Tearing down test containers...');

  const postgresContainer = (global as any)
    .__POSTGRES_CONTAINER__ as StartedTestContainer;
  const rustfsContainer = (global as any)
    .__RUSTFS_CONTAINER__ as StartedTestContainer;
  const mailhogContainer = (global as any)
    .__MAILHOG_CONTAINER__ as StartedTestContainer;
  const kafkaContainer = (global as any)
    .__KAFKA_CONTAINER__ as StartedTestContainer;

  if (postgresContainer) {
    await postgresContainer.stop();
    console.log('PostgreSQL container stopped');
  }

  if (rustfsContainer) {
    await rustfsContainer.stop();
    console.log('RustFS container stopped');
  }

  if (mailhogContainer) {
    await mailhogContainer.stop();
    console.log('MailHog container stopped');
  }

  if (kafkaContainer) {
    await kafkaContainer.stop();
    console.log('Kafka container stopped');
  }

  console.log('Test containers teardown complete');
};
