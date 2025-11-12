import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers';

let postgresContainer: StartedTestContainer;
let minioContainer: StartedTestContainer;
let mailhogContainer: StartedTestContainer;

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

  const postgresUrl = `postgres://omnibox:omnibox@${postgresContainer.getHost()}:${postgresContainer.getMappedPort(5432)}/omnibox`;
  const minioUrl = `http://minioadmin:minioadmin@${minioContainer.getHost()}:${minioContainer.getMappedPort(9000)}/omnibox`;
  const mailTransport = `smtp://${mailhogContainer.getHost()}:${mailhogContainer.getMappedPort(1025)}`;
  console.log(`PostgreSQL URL: ${postgresUrl}`);
  console.log(`MinIO URL: ${minioUrl}`);
  console.log(`Mail Transport: ${mailTransport}`);

  process.env.OBB_POSTGRES_URL = postgresUrl;
  process.env.OBB_MINIO_URL = minioUrl;
  process.env.OBB_DB_SYNC = 'false';
  process.env.OBB_DB_LOGGING = 'false';
  process.env.OBB_S3_ACCESS_KEY_ID = 'minioadmin';
  process.env.OBB_S3_SECRET_ACCESS_KEY = 'minioadmin';
  process.env.OBB_S3_URL = `http://${minioContainer.getHost()}:${minioContainer.getMappedPort(9000)}`;
  process.env.OBB_S3_ENDPOINT = `http://${minioContainer.getHost()}:${minioContainer.getMappedPort(9000)}`;
  process.env.OBB_S3_BUCKET = 'omnibox-test';
  process.env.OBB_S3_PREFIX = 'uploaded-files';
  process.env.OBB_MAIL_TRANSPORT = mailTransport;
  process.env.OBB_MAIL_FROM = '"Test <test@example.com>"';
  process.env.OBB_WIZARD_BASE_URL = 'http://localhost:8080';

  // WeChat Pay test configuration
  process.env.OBB_WECHAT_APP_KEY = 'test-wechat-app-key';
  process.env.OBB_WECHAT_PAY_APPID = 'test-wechat-pay-appid';
  process.env.OBB_WECHAT_PAY_MCHID = 'test-wechat-pay-mchid';
  process.env.OBB_WECHAT_PAY_SERIAL = 'test-wechat-pay-serial';
  // Test PEM certificate for testing
  process.env.OBB_WECHAT_PAY_CERT = `-----BEGIN CERTIFICATE-----
MIIDizCCAnOgAwIBAgIUbAkfd5MpDjJ7pMqmEuWDkmWGrLIwDQYJKoZIhvcNAQEL
BQAwVTELMAkGA1UEBhMCQ04xDTALBgNVBAgMBFRlc3QxDTALBgNVBAcMBFRlc3Qx
DTALBgNVBAoMBFRlc3QxGTAXBgNVBAMMEHRlc3QuZXhhbXBsZS5jb20wHhcNMjUx
MTEyMDcyMjM0WhcNMjYxMTEyMDcyMjM0WjBVMQswCQYDVQQGEwJDTjENMAsGA1UE
CAwEVGVzdDENMAsGA1UEBwwEVGVzdDENMAsGA1UECgwEVGVzdDEZMBcGA1UEAwwQ
dGVzdC5leGFtcGxlLmNvbTCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEB
AM2G6AI2TYuH3fjtKnyEaXhU6VzayBk1YNuaGkmKrtKiPS+Za2mJA/2XzGXaZN8s
OM0N2T6OPlqoEPZYOGoAozHomKncZUtICQn2zt0QnFSjALzzywTW9wim62JWQmJr
xTa0Y5Jj8mEuu52ZwA37Bhbc4Yabr4LLW7Z/NWyPQ6bU3vhApTKoLx4PGe6yXsEY
h+hX22P4n/0gHwkDbCEUdgbQlHcPGJdnKFfOoi/MwG4PUEaHisztXJxMwCIRWTk6
qyCyq3s8/BDcvX1D0+ZIpJoIQAbt0jfo1FikZGiPC29f6WlnuZYIo3B2Ah3bTErM
s1CYYC5lJpDF3XzEV/xOAJ8CAwEAAaNTMFEwHQYDVR0OBBYEFAkGlw9eG7f3o3hH
qK33A5rKmORIMB8GA1UdIwQYMBaAFAkGlw9eG7f3o3hHqK33A5rKmORIMA8GA1Ud
EwEB/wQFMAMBAf8wDQYJKoZIhvcNAQELBQADggEBADhxdLWSCFNjdbhBLf9s9odq
Fw1J/sTAX6sn4a5FbBtQB38h+lZTSZcQ1H0znUNAzbPQcbg9KrRFboSd6TjGhHnt
ViMiD7JTsR/E6MMi8TxVMknGxJibPAG61qyJ4y7oFQEEjdShHqNWp6Fc6N0XKBRZ
yDcDt/rJIjZBFwAuZFxDIdw4P1BUN3UsI0YN+Q3UrmyPWxCRk5Egt0n3kGVfuMKC
IXr+Y/sVaONOqAynLSD3V4LhH3Z5xnJoCtkzvb6yY7R7xTueCGr1HExwN7OuAVgU
kVPsohepqliflHYmOjAnyl9RfKpPmeSIdXyZS9jKddH07hTWhmfGkaNK2Yd0qZM=
-----END CERTIFICATE-----`;
  // Test private key for testing
  process.env.OBB_WECHAT_PAY_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDNhugCNk2Lh934
7Sp8hGl4VOlc2sgZNWDbmhpJiq7Soj0vmWtpiQP9l8xl2mTfLDjNDdk+jj5aqBD2
WDhqAKMx6Jip3GVLSAkJ9s7dEJxUowC888sE1vcIputiVkJia8U2tGOSY/JhLrud
mcAN+wYW3OGGm6+Cy1u2fzVsj0Om1N74QKUyqC8eDxnusl7BGIfoV9tj+J/9IB8J
A2whFHYG0JR3DxiXZyhXzqIvzMBuD1BGh4rM7VycTMAiEVk5Oqsgsqt7PPwQ3L19
Q9PmSKSaCEAG7dI36NRYpGRojwtvX+lpZ7mWCKNwdgId20xKzLNQmGAuZSaQxd18
xFf8TgCfAgMBAAECggEADoUXYwCfHdptbiajN8TLBrtI+UxjkpRY0WrjrIplq2/W
zsQR+JS7eXD9+bwiIDopkSMHVAoMka8J871rzuFYpi/+iRGO/nCKYu/S0X9Y7AnQ
BYlbsG3Xaf8Q5hOeAQIIHsNDvZXeC8uXaZzxGou/dGIKdM4O6jiftBbsmUzNxL1o
x4JJd0kZotijsgMnggmaiwBomKQJGXcNx35GC99I5LOpUlpVc1Y6U3A3qJk9+pxt
YquxyeBg/bDrf59itKlOrZaPgbsLxN7lV4rfcNqHD65oc4rUwGg+81WLG8qVEWZ1
x2Cv6yJYP6W52EMpovLd/9F6bKBWb2RXV3dxh8lHcQKBgQDxR6a509Ct708Ci+a2
iy37HJ5JkHyvzvnmbYTjmP3evjpjYf9F7lq7T11NhaAEPgrqdGa/Bnzz+V85Pnzf
dtRKxu/wM9IxQUWG/fSQ/0snCzqh6pY5nj56fi/Mxq1+6/29QcIfK9daajfPkyvb
KSfw2CfPLnfyvESyqXXgQP+LowKBgQDaENw3JMEdqSaSbc6PCtaAmSLBpo1suXnA
0MrcdMXu+gq+vQ6Bu1ACx/FTSumwlZ7h8eqVuUU7vF3smHH0nVqUm2DqXw0n7TCw
xy1CCGNXncLiO5D49dYtbBDusrTvtQ+5C/mvb3xnxFY42HrrpsIDA1xtRowNQGQL
GUMiEoMG1QKBgEjCVanGETDScJ4Q+DLmB6io+aavdppBrSRqtF85/JyV+t+LZsJ8
3UmM5lMBT77Xwszu6ykB2N5tveRyTo/Isr4V/bcOuXz29PN/U6gCBHSysyyupDyd
1rNzqBB1fU4/9hWDZfmma9utGkVzWQ9O+udrF54noi5FzeWeqphEoYtHAoGBAKn6
jH2bc8D4Ei3/1AwiKZPySmpitkiyxxoqZoazq3odg/SsD7vGU5bnXdBMS56u8jsz
RGVTFol6ykfbiLBhW7MM7t2iG/IsbFDP4RJg0XcBbWDFh7rYfgvH+ebmfC2BmHDo
yccbgwCrxX3oGODJit+oZgpz/EV0FMel+HN9tI7FAoGASBmJzdRIWwec0JzLOHZc
51f9K5GBE1/rOrLH06EVzpx7Tl+WYOu2jmNntCyVrNJpb2Ne/mkTgvxwOPIjRwCK
DJ7cwOmTkqG1P9Xfbw91KJJEMG1HDJE1imeCyA/cICcvKOlQVO/gTMGazRjT8DNU
HIXqNNu6h7JCvxhJczcYKHM=
-----END PRIVATE KEY-----`;

  (global as any).__POSTGRES_CONTAINER__ = postgresContainer;
  (global as any).__MINIO_CONTAINER__ = minioContainer;
  (global as any).__MAILHOG_CONTAINER__ = mailhogContainer;
};
