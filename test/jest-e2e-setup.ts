import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers';

let postgresContainer: StartedTestContainer;
let minioContainer: StartedTestContainer;
let mailhogContainer: StartedTestContainer;
let kafkaContainer: StartedTestContainer;

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
    .withHealthCheck({
      test: ['CMD', 'pg_isready', '-q', '-d', 'omnibox', '-U', 'omnibox'],
      interval: 30000,
      timeout: 3000,
      retries: 5,
      startPeriod: 5000,
    })
    .withWaitStrategy(Wait.forHealthCheck())
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
    .withHealthCheck({
      test: ['CMD', 'curl', '-I', 'http://127.0.0.1:9000/minio/health/live'],
      interval: 5000,
      timeout: 3000,
      retries: 5,
    })
    .withWaitStrategy(Wait.forHealthCheck())
    .start();
  console.log('MinIO container started');

  mailhogContainer = await new GenericContainer('mailhog/mailhog:latest')
    .withExposedPorts(1025, 8025)
    .withWaitStrategy(Wait.forListeningPorts())
    .start();
  console.log('MailHog container started');

  const kafkaPort = 19092; // Use fixed port for tests
  kafkaContainer = await new GenericContainer('apache/kafka:latest')
    .withExposedPorts({ container: 9092, host: kafkaPort })
    .withEnvironment({
      KAFKA_NODE_ID: '1',
      KAFKA_PROCESS_ROLES: 'broker,controller',
      KAFKA_LISTENERS: 'PLAINTEXT://0.0.0.0:9092,CONTROLLER://0.0.0.0:9093',
      KAFKA_ADVERTISED_LISTENERS: `PLAINTEXT://localhost:${kafkaPort}`,
      KAFKA_CONTROLLER_LISTENER_NAMES: 'CONTROLLER',
      KAFKA_LISTENER_SECURITY_PROTOCOL_MAP:
        'CONTROLLER:PLAINTEXT,PLAINTEXT:PLAINTEXT',
      KAFKA_CONTROLLER_QUORUM_VOTERS: '1@localhost:9093',
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: '1',
      KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR: '1',
      KAFKA_TRANSACTION_STATE_LOG_MIN_ISR: '1',
      KAFKA_GROUP_INITIAL_REBALANCE_DELAY_MS: '0',
      KAFKA_NUM_PARTITIONS: '1',
    })
    .withWaitStrategy(Wait.forListeningPorts())
    .start();
  console.log('Kafka container started');

  const postgresUrl = `postgres://omnibox:omnibox@${postgresContainer.getHost()}:${postgresContainer.getMappedPort(5432)}/omnibox`;
  const mailTransport = `smtp://${mailhogContainer.getHost()}:${mailhogContainer.getMappedPort(1025)}`;
  const kafkaBroker = `${kafkaContainer.getHost()}:${kafkaContainer.getMappedPort(9092)}`;
  console.log(`PostgreSQL URL: ${postgresUrl}`);
  console.log(`Mail Transport: ${mailTransport}`);
  console.log(`Kafka Broker: ${kafkaBroker}`);

  process.env.OBB_POSTGRES_URL = postgresUrl;
  process.env.OBB_DB_SYNC = 'false';
  process.env.OBB_DB_LOGGING = 'false';
  process.env.OBB_S3_ACCESS_KEY_ID = 'minioadmin';
  process.env.OBB_S3_SECRET_ACCESS_KEY = 'minioadmin';
  process.env.OBB_S3_ENDPOINT = `http://${minioContainer.getHost()}:${minioContainer.getMappedPort(9000)}`;
  process.env.OBB_S3_BUCKET = 'omnibox-test';
  process.env.OBB_S3_FORCE_PATH_STYLE = 'true';
  process.env.OBB_MAIL_TRANSPORT = mailTransport;
  process.env.OBB_MAIL_FROM = '"Test <test@example.com>"';
  process.env.OBB_WIZARD_BASE_URL = 'http://localhost:8080';
  process.env.OBB_KAFKA_BROKER = kafkaBroker;

  (global as any).__POSTGRES_CONTAINER__ = postgresContainer;
  (global as any).__MINIO_CONTAINER__ = minioContainer;
  (global as any).__MAILHOG_CONTAINER__ = mailhogContainer;
  (global as any).__KAFKA_CONTAINER__ = kafkaContainer;
};
