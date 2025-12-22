import { DataSource, QueryRunner } from 'typeorm';
import { AddAdminRole1766339893375 } from './1766339893375-add-admin-role';

describe.skip('AddAdminRole Migration E2E', () => {
  let dataSource: DataSource;
  let queryRunner: QueryRunner;

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'postgres',
      url: process.env.OBB_POSTGRES_URL,
      entities: [],
      migrations: [],
      synchronize: false,
    });
    await dataSource.initialize();
  });

  beforeEach(async () => {
    queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    // Drop tables if exist to have clean state
    await queryRunner.query('DROP TABLE IF EXISTS namespace_members CASCADE');
    await queryRunner.query('DROP TYPE IF EXISTS namespace_role CASCADE');

    // Create namespace_role enum without admin
    await queryRunner.query(`
      CREATE TYPE namespace_role AS ENUM ('owner', 'member')
    `);

    // Create namespace_members table structure for testing
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS namespace_members (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        namespace_id character varying NOT NULL,
        user_id uuid NOT NULL,
        role namespace_role NOT NULL DEFAULT 'member',
        created_at timestamp with time zone DEFAULT now(),
        updated_at timestamp with time zone DEFAULT now(),
        deleted_at timestamp with time zone
      )
    `);

    // Commit to allow ALTER TYPE in migration
    await queryRunner.commitTransaction();
    await queryRunner.startTransaction();
  });

  afterEach(async () => {
    await queryRunner.rollbackTransaction();
    await queryRunner.release();
  });

  afterAll(async () => {
    const cleanRunner = dataSource.createQueryRunner();
    await cleanRunner.connect();

    // Drop the test-created objects
    await cleanRunner.query('DROP TABLE IF EXISTS namespace_members CASCADE');
    await cleanRunner.query('DROP TYPE IF EXISTS namespace_role CASCADE');

    // Restore the original schema so subsequent tests can run
    // Recreate enum with admin (matches state after AddAdminRole migration)
    await cleanRunner.query(`
      CREATE TYPE namespace_role AS ENUM ('owner', 'admin', 'member')
    `);

    // Recreate table with structure matching Init migration
    await cleanRunner.query(`
      CREATE TABLE namespace_members (
        id bigserial PRIMARY KEY,
        namespace_id character varying NOT NULL,
        user_id uuid NOT NULL,
        role namespace_role NOT NULL,
        root_resource_id character varying NOT NULL,
        created_at timestamp with time zone DEFAULT now(),
        updated_at timestamp with time zone DEFAULT now(),
        deleted_at timestamp with time zone
      )
    `);

    // Recreate unique index
    await cleanRunner.query(`
      CREATE UNIQUE INDEX idx_namespace_members_user_namespace
      ON namespace_members(user_id, namespace_id)
      WHERE deleted_at IS NULL
    `);

    await cleanRunner.release();
    await dataSource.destroy();
  });

  describe('Admin enum value', () => {
    it('should add admin value to namespace_role enum', async () => {
      // Verify admin doesn't exist initially
      const enumBefore = await queryRunner.query(`
        SELECT enumlabel FROM pg_enum
        WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'namespace_role')
        ORDER BY enumsortorder
      `);
      expect(enumBefore.map((r: { enumlabel: string }) => r.enumlabel)).toEqual(
        ['owner', 'member'],
      );

      // Execute migration
      const migration = new AddAdminRole1766339893375();
      await migration.up(queryRunner);

      // Verify admin was added
      const enumAfter = await queryRunner.query(`
        SELECT enumlabel FROM pg_enum
        WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'namespace_role')
        ORDER BY enumsortorder
      `);
      expect(
        enumAfter.map((r: { enumlabel: string }) => r.enumlabel),
      ).toContain('admin');
    });

    it('should not fail if admin already exists', async () => {
      // Add admin value first
      await queryRunner.commitTransaction();
      await queryRunner.query(`ALTER TYPE namespace_role ADD VALUE 'admin'`);
      await queryRunner.startTransaction();

      // Execute migration - should not throw
      const migration = new AddAdminRole1766339893375();
      await expect(migration.up(queryRunner)).resolves.not.toThrow();
    });
  });

  describe('Owner demotion', () => {
    it('should keep oldest owner and demote others to admin', async () => {
      // Add admin value first (simulating fresh migration)
      await queryRunner.commitTransaction();
      await queryRunner.query(`ALTER TYPE namespace_role ADD VALUE 'admin'`);
      await queryRunner.startTransaction();

      // Setup: Create namespace with multiple owners
      const namespaceId = 'test-namespace-1';

      await queryRunner.query(
        `
        INSERT INTO namespace_members (id, namespace_id, user_id, role, created_at) VALUES
        ('11111111-1111-1111-1111-111111111111', $1, '00000000-0000-0000-0000-000000000001', 'owner', '2024-01-01 00:00:00'),
        ('22222222-2222-2222-2222-222222222222', $1, '00000000-0000-0000-0000-000000000002', 'owner', '2024-01-02 00:00:00'),
        ('33333333-3333-3333-3333-333333333333', $1, '00000000-0000-0000-0000-000000000003', 'owner', '2024-01-03 00:00:00')
      `,
        [namespaceId],
      );

      // Execute migration
      const migration = new AddAdminRole1766339893375();
      await migration.up(queryRunner);

      // Verify results
      const results = await queryRunner.query(
        `
        SELECT id, role FROM namespace_members WHERE namespace_id = $1 ORDER BY created_at
      `,
        [namespaceId],
      );

      // First owner (oldest) should remain owner
      expect(results[0].role).toBe('owner');
      // Second and third owners should be demoted to admin
      expect(results[1].role).toBe('admin');
      expect(results[2].role).toBe('admin');
    });

    it('should not affect namespaces with single owner', async () => {
      // Add admin value first
      await queryRunner.commitTransaction();
      await queryRunner.query(`ALTER TYPE namespace_role ADD VALUE 'admin'`);
      await queryRunner.startTransaction();

      const namespaceId = 'single-owner-ns';

      await queryRunner.query(
        `
        INSERT INTO namespace_members (id, namespace_id, user_id, role, created_at) VALUES
        ('44444444-4444-4444-4444-444444444444', $1, '00000000-0000-0000-0000-000000000004', 'owner', '2024-01-01 00:00:00'),
        ('55555555-5555-5555-5555-555555555555', $1, '00000000-0000-0000-0000-000000000005', 'member', '2024-01-02 00:00:00')
      `,
        [namespaceId],
      );

      const migration = new AddAdminRole1766339893375();
      await migration.up(queryRunner);

      const results = await queryRunner.query(
        `
        SELECT id, role FROM namespace_members WHERE namespace_id = $1 ORDER BY created_at
      `,
        [namespaceId],
      );

      expect(results[0].role).toBe('owner');
      expect(results[1].role).toBe('member');
    });

    it('should handle multiple namespaces independently', async () => {
      // Add admin value first
      await queryRunner.commitTransaction();
      await queryRunner.query(`ALTER TYPE namespace_role ADD VALUE 'admin'`);
      await queryRunner.startTransaction();

      const ns1 = 'namespace-1';
      const ns2 = 'namespace-2';

      await queryRunner.query(
        `
        INSERT INTO namespace_members (id, namespace_id, user_id, role, created_at) VALUES
        ('66666666-6666-6666-6666-666666666661', $1, '00000000-0000-0000-0000-000000000001', 'owner', '2024-01-01 00:00:00'),
        ('66666666-6666-6666-6666-666666666662', $1, '00000000-0000-0000-0000-000000000002', 'owner', '2024-01-02 00:00:00'),
        ('77777777-7777-7777-7777-777777777771', $2, '00000000-0000-0000-0000-000000000003', 'owner', '2024-01-03 00:00:00'),
        ('77777777-7777-7777-7777-777777777772', $2, '00000000-0000-0000-0000-000000000004', 'owner', '2024-01-04 00:00:00')
      `,
        [ns1, ns2],
      );

      const migration = new AddAdminRole1766339893375();
      await migration.up(queryRunner);

      // Check namespace 1
      const ns1Results = await queryRunner.query(
        `
        SELECT role FROM namespace_members WHERE namespace_id = $1 ORDER BY created_at
      `,
        [ns1],
      );
      expect(ns1Results[0].role).toBe('owner');
      expect(ns1Results[1].role).toBe('admin');

      // Check namespace 2
      const ns2Results = await queryRunner.query(
        `
        SELECT role FROM namespace_members WHERE namespace_id = $1 ORDER BY created_at
      `,
        [ns2],
      );
      expect(ns2Results[0].role).toBe('owner');
      expect(ns2Results[1].role).toBe('admin');
    });

    it('should not affect soft-deleted owners', async () => {
      // Add admin value first
      await queryRunner.commitTransaction();
      await queryRunner.query(`ALTER TYPE namespace_role ADD VALUE 'admin'`);
      await queryRunner.startTransaction();

      const namespaceId = 'soft-delete-ns';

      await queryRunner.query(
        `
        INSERT INTO namespace_members (id, namespace_id, user_id, role, created_at, deleted_at) VALUES
        ('88888888-8888-8888-8888-888888888881', $1, '00000000-0000-0000-0000-000000000001', 'owner', '2024-01-01 00:00:00', NULL),
        ('88888888-8888-8888-8888-888888888882', $1, '00000000-0000-0000-0000-000000000002', 'owner', '2024-01-02 00:00:00', '2024-06-01 00:00:00'),
        ('88888888-8888-8888-8888-888888888883', $1, '00000000-0000-0000-0000-000000000003', 'owner', '2024-01-03 00:00:00', NULL)
      `,
        [namespaceId],
      );

      const migration = new AddAdminRole1766339893375();
      await migration.up(queryRunner);

      const results = await queryRunner.query(
        `
        SELECT id, role FROM namespace_members WHERE namespace_id = $1 ORDER BY created_at
      `,
        [namespaceId],
      );

      // First non-deleted owner stays owner
      expect(results[0].role).toBe('owner');
      // Soft-deleted owner stays owner (not counted in active owners)
      expect(results[1].role).toBe('owner');
      // Third owner (second active) gets demoted
      expect(results[2].role).toBe('admin');
    });
  });

  describe('Down migration', () => {
    it('should throw error for down migration', () => {
      const migration = new AddAdminRole1766339893375();
      expect(() => migration.down()).toThrow('Not supported');
    });
  });
});
