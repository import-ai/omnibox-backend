import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers';

let postgresContainer: StartedTestContainer;
let rustfsContainer: StartedTestContainer;
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

  rustfsContainer = await new GenericContainer(
    'rustfs/rustfs:1.0.0@sha256:8cc9801755448b71a786705ce76692c77e14936cccd87cf2fc31842e58f4d1ff',
  )
    .withExposedPorts(9000)
    .withEnvironment({
      RUSTFS_ACCESS_KEY: 'rustfsadmin',
      RUSTFS_SECRET_KEY: 'rustfsadmin',
    })
    .withCommand(['/data'])
    .withWaitStrategy(Wait.forHttp('/health/ready', 9000).forStatusCode(200))
    .start();
  console.log('RustFS container started');

  mailhogContainer = await new GenericContainer('mailhog/mailhog:latest')
    .withExposedPorts(1025, 8025)
    .withWaitStrategy(Wait.forListeningPorts())
    .start();
  console.log('MailHog container started');

  const kafkaPort = 19092; // Use fixed port for tests
  kafkaContainer = await new GenericContainer('bitnamilegacy/kafka:4.0')
    .withExposedPorts({ container: 9092, host: kafkaPort })
    .withEnvironment({
      KAFKA_CFG_NODE_ID: '0',
      KAFKA_CFG_PROCESS_ROLES: 'controller,broker',
      KAFKA_CFG_CONTROLLER_QUORUM_VOTERS: '0@localhost:9093',
      KAFKA_CFG_LISTENERS: 'PLAINTEXT://:9092,CONTROLLER://:9093',
      KAFKA_CFG_ADVERTISED_LISTENERS: `PLAINTEXT://localhost:${kafkaPort}`,
      KAFKA_CFG_LISTENER_SECURITY_PROTOCOL_MAP:
        'CONTROLLER:PLAINTEXT,PLAINTEXT:PLAINTEXT',
      KAFKA_CFG_CONTROLLER_LISTENER_NAMES: 'CONTROLLER',
      KAFKA_CFG_INTER_BROKER_LISTENER_NAME: 'PLAINTEXT',
    })
    .withWaitStrategy(Wait.forListeningPorts())
    .start();
  console.log('Kafka container started');

  const postgresUrl = `postgres://omnibox:omnibox@${postgresContainer.getHost()}:${postgresContainer.getMappedPort(5432)}/omnibox`;
  const mailTransport = `smtp://${mailhogContainer.getHost()}:${mailhogContainer.getMappedPort(1025)}`;
  const mailhogApiUrl = `http://${mailhogContainer.getHost()}:${mailhogContainer.getMappedPort(8025)}`;
  const kafkaBroker = `${kafkaContainer.getHost()}:${kafkaContainer.getMappedPort(9092)}`;
  console.log(`PostgreSQL URL: ${postgresUrl}`);
  console.log(`Mail Transport: ${mailTransport}`);
  console.log(`MailHog API URL: ${mailhogApiUrl}`);
  console.log(`Kafka Broker: ${kafkaBroker}`);

  process.env.OBB_POSTGRES_URL = postgresUrl;
  process.env.OBB_DB_SYNC = 'false';
  process.env.OBB_DB_LOGGING = 'false';
  process.env.OBB_S3_ACCESS_KEY_ID = 'rustfsadmin';
  process.env.OBB_S3_SECRET_ACCESS_KEY = 'rustfsadmin';
  process.env.OBB_S3_ENDPOINT = `http://${rustfsContainer.getHost()}:${rustfsContainer.getMappedPort(9000)}`;
  process.env.OBB_S3_BUCKET = 'omnibox-test';
  process.env.OBB_S3_FORCE_PATH_STYLE = 'true';
  process.env.OBB_MAIL_TRANSPORT = mailTransport;
  process.env.OBB_MAIL_FROM = '"Test <test@example.com>"';
  process.env.OBB_WIZARD_BASE_URL = 'http://localhost:8080';
  process.env.OBB_KAFKA_BROKER = kafkaBroker;
  process.env.OBB_PRO_URL = '';
  process.env.MAILHOG_API_URL = mailhogApiUrl;

  (global as any).__POSTGRES_CONTAINER__ = postgresContainer;
  (global as any).__RUSTFS_CONTAINER__ = rustfsContainer;
  (global as any).__MAILHOG_CONTAINER__ = mailhogContainer;
  (global as any).__KAFKA_CONTAINER__ = kafkaContainer;
};
