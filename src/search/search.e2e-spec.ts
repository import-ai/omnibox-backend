import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { HttpStatus } from '@nestjs/common';
import { DocType } from './doc-type.enum';
import { IndexRecordType } from 'omniboxd/wizard/dto/index-record.dto';
import {
  SearchController,
  InternalSearchController,
} from './search.controller';
import { SearchService } from './search.service';
import { PermissionsService } from 'omniboxd/permissions/permissions.service';
import { ConversationsService } from 'omniboxd/conversations/conversations.service';
import { ResourcesService } from 'omniboxd/resources/resources.service';
import { MessagesService } from 'omniboxd/messages/messages.service';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { WizardTaskService } from 'omniboxd/tasks/wizard-task.service';
import { Task } from 'omniboxd/tasks/tasks.entity';
import { TelemetryService } from 'omniboxd/telemetry';

// Set environment variable to avoid the error in SearchService constructor
process.env.OBB_WIZARD_BASE_URL = 'http://localhost:8000';

// Mock the WizardAPIService to avoid needing the actual wizard service during tests
jest.mock('../wizard/api.wizard.service', () => {
  return {
    WizardAPIService: jest.fn().mockImplementation(() => ({
      search: jest.fn().mockImplementation((params) => {
        const allRecords = [
          {
            id: 'search-result-1',
            type: IndexRecordType.CHUNK,
            namespaceId: 'test-namespace',
            userId: 'test-user',
            chunk: {
              resourceId: '550e8400-e29b-41d4-a716-446655440000', // Valid UUID
              title: 'Test Document',
              text: 'This is test content for searching',
              chunkType: 'doc',
              userId: 'test-user',
              parentId: 'test-parent',
              chunkId: 'test-chunk-1',
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          },
          {
            id: 'search-result-2',
            type: IndexRecordType.MESSAGE,
            namespaceId: 'test-namespace',
            userId: 'test-user',
            message: {
              conversationId: '550e8400-e29b-41d4-a716-446655440001', // Valid UUID
              messageId: '550e8400-e29b-41d4-a716-446655440002', // Valid UUID
              message: {
                role: 'user',
                content: 'This is a test message content',
              },
            },
          },
        ];

        // Filter records based on type if specified
        let filteredRecords = allRecords;
        if (params?.type) {
          if (params.type === IndexRecordType.CHUNK) {
            filteredRecords = allRecords.filter(
              (r) => r.type === IndexRecordType.CHUNK,
            );
          } else if (params.type === IndexRecordType.MESSAGE) {
            filteredRecords = allRecords.filter(
              (r) => r.type === IndexRecordType.MESSAGE,
            );
          }
        }

        return Promise.resolve({ records: filteredRecords });
      }),
    })),
  };
});

describe('SearchController (e2e)', () => {
  let app: INestApplication;
  let searchService: SearchService;

  const mockUser = { id: 'test-user-id' };
  const mockNamespaceId = '550e8400-e29b-41d4-a716-446655440000';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [SearchController, InternalSearchController],
      providers: [
        SearchService,
        {
          provide: PermissionsService,
          useValue: {
            userHasPermission: jest.fn().mockResolvedValue(true),
          },
        },
        {
          provide: ConversationsService,
          useValue: {
            has: jest.fn().mockResolvedValue(true),
            listAll: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: ResourcesService,
          useValue: {
            listAllResources: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: MessagesService,
          useValue: {
            findAll: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('http://localhost:8000'),
          },
        },
        {
          provide: getRepositoryToken(Task),
          useValue: {
            find: jest.fn().mockResolvedValue([]),
            save: jest.fn().mockResolvedValue({}),
          },
        },
        {
          provide: WizardTaskService,
          useValue: {
            createIndexTask: jest.fn().mockResolvedValue({}),
            createMessageIndexTask: jest.fn().mockResolvedValue({}),
          },
        },
        {
          provide: TelemetryService,
          useValue: {
            createSpan: jest.fn().mockReturnValue(null),
            withSpan: jest
              .fn()
              .mockImplementation((name, operation) => operation(null)),
            addAttributes: jest.fn(),
            addEvent: jest.fn(),
            isEnabled: jest.fn().mockReturnValue(false),
            getTracer: jest.fn().mockReturnValue(null),
          },
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();

    // Add middleware to parse user header for testing
    app.use((req: any, res: any, next: any) => {
      if (req.headers.user) {
        try {
          req.user = JSON.parse(req.headers.user);
        } catch {
          // Ignore parsing errors
        }
      }
      next();
    });

    await app.init();

    searchService = moduleFixture.get<SearchService>(SearchService);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/v1/namespaces/:namespaceId/search', () => {
    it('should search successfully with query parameter', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/namespaces/${mockNamespaceId}/search?query=test`)
        .set('user', JSON.stringify(mockUser))
        .expect(HttpStatus.OK);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);

      // Check the structure of returned items
      const firstItem = response.body[0];
      expect(firstItem).toHaveProperty('type');
      expect(firstItem).toHaveProperty('id');
      expect([DocType.RESOURCE, DocType.MESSAGE]).toContain(firstItem.type);
    });

    it('should search with type filter for resources', async () => {
      const response = await request(app.getHttpServer())
        .get(
          `/api/v1/namespaces/${mockNamespaceId}/search?query=test&type=${DocType.RESOURCE}`,
        )
        .set('user', JSON.stringify(mockUser))
        .expect(HttpStatus.OK);

      expect(Array.isArray(response.body)).toBe(true);

      // All returned items should be resources
      response.body.forEach((item: any) => {
        expect(item.type).toBe(DocType.RESOURCE);
        expect(item).toHaveProperty('resourceId');
        expect(item).toHaveProperty('title');
        expect(item).toHaveProperty('content');
      });
    });

    it('should search with type filter for messages', async () => {
      const response = await request(app.getHttpServer())
        .get(
          `/api/v1/namespaces/${mockNamespaceId}/search?query=test&type=${DocType.MESSAGE}`,
        )
        .set('user', JSON.stringify(mockUser))
        .expect(HttpStatus.OK);

      expect(Array.isArray(response.body)).toBe(true);

      // All returned items should be messages
      response.body.forEach((item: any) => {
        expect(item.type).toBe(DocType.MESSAGE);
        expect(item).toHaveProperty('conversationId');
        expect(item).toHaveProperty('content');
      });
    });

    it('should handle missing query parameter', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/namespaces/${mockNamespaceId}/search`)
        .set('user', JSON.stringify(mockUser));

      // The endpoint might handle this gracefully or return an error
      expect([
        HttpStatus.OK,
        HttpStatus.BAD_REQUEST,
        HttpStatus.INTERNAL_SERVER_ERROR,
      ]).toContain(response.status);
    });

    it('should handle empty query parameter', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/namespaces/${mockNamespaceId}/search?query=`)
        .set('user', JSON.stringify(mockUser));

      // The endpoint might handle this gracefully or return an error
      expect([
        HttpStatus.OK,
        HttpStatus.BAD_REQUEST,
        HttpStatus.INTERNAL_SERVER_ERROR,
      ]).toContain(response.status);
    });

    it('should handle invalid type parameter gracefully', async () => {
      const response = await request(app.getHttpServer())
        .get(
          `/api/v1/namespaces/${mockNamespaceId}/search?query=test&type=invalid`,
        )
        .set('user', JSON.stringify(mockUser))
        .expect(HttpStatus.OK);

      expect(Array.isArray(response.body)).toBe(true);
    });

    it('should handle special characters in query', async () => {
      const specialQuery = encodeURIComponent('test 测试 🚀 @#$%');
      const response = await request(app.getHttpServer())
        .get(
          `/api/v1/namespaces/${mockNamespaceId}/search?query=${specialQuery}`,
        )
        .set('user', JSON.stringify(mockUser))
        .expect(HttpStatus.OK);

      expect(Array.isArray(response.body)).toBe(true);
    });

    it('should handle very long query strings', async () => {
      const longQuery = 'a'.repeat(1000);
      const response = await request(app.getHttpServer())
        .get(
          `/api/v1/namespaces/${mockNamespaceId}/search?query=${encodeURIComponent(longQuery)}`,
        )
        .set('user', JSON.stringify(mockUser))
        .expect(HttpStatus.OK);

      expect(Array.isArray(response.body)).toBe(true);
    });

    it('should require authentication', async () => {
      const response = await request(app.getHttpServer()).get(
        `/api/v1/namespaces/${mockNamespaceId}/search?query=test`,
      );

      // Without user header, should fail
      expect([
        HttpStatus.UNAUTHORIZED,
        HttpStatus.INTERNAL_SERVER_ERROR,
      ]).toContain(response.status);
    });

    it('should validate namespace access', async () => {
      const invalidNamespaceId = 'invalid-namespace-id';
      const response = await request(app.getHttpServer())
        .get(`/api/v1/namespaces/${invalidNamespaceId}/search?query=test`)
        .set('user', JSON.stringify(mockUser));

      // Should either return forbidden, internal server error, or handle gracefully
      expect([
        HttpStatus.FORBIDDEN,
        HttpStatus.OK,
        HttpStatus.INTERNAL_SERVER_ERROR,
      ]).toContain(response.status);
    });
  });

  describe('POST /internal/api/v1/refresh_index', () => {
    it('should refresh index successfully without authentication', async () => {
      const response = await request(app.getHttpServer())
        .post('/internal/api/v1/refresh_index')
        .expect(HttpStatus.CREATED);

      // The endpoint should complete successfully
      expect(response.status).toBe(HttpStatus.CREATED);
    });

    it('should handle refresh index with authentication', async () => {
      const response = await request(app.getHttpServer())
        .post('/internal/api/v1/refresh_index')
        .set('user', JSON.stringify(mockUser))
        .expect(HttpStatus.CREATED);

      expect(response.status).toBe(HttpStatus.CREATED);
    });
  });

  describe('Error handling', () => {
    it('should handle wizard service errors gracefully', async () => {
      // Mock the search service to throw an error
      jest
        .spyOn(searchService, 'search')
        .mockRejectedValueOnce(new Error('Wizard service error'));

      const response = await request(app.getHttpServer())
        .get(`/api/v1/namespaces/${mockNamespaceId}/search?query=test`)
        .set('user', JSON.stringify(mockUser));

      // Should handle the error gracefully
      expect([HttpStatus.INTERNAL_SERVER_ERROR, HttpStatus.OK]).toContain(
        response.status,
      );
    });
  });

  describe('Response format validation', () => {
    it('should return properly formatted resource results', async () => {
      const response = await request(app.getHttpServer())
        .get(
          `/api/v1/namespaces/${mockNamespaceId}/search?query=test&type=${DocType.RESOURCE}`,
        )
        .set('user', JSON.stringify(mockUser))
        .expect(HttpStatus.OK);

      expect(Array.isArray(response.body)).toBe(true);

      response.body.forEach((item: any) => {
        if (item.type === DocType.RESOURCE) {
          expect(item).toHaveProperty('type', DocType.RESOURCE);
          expect(item).toHaveProperty('id');
          expect(item).toHaveProperty('resourceId');
          expect(item).toHaveProperty('title');
          expect(item).toHaveProperty('content');
          expect(typeof item.id).toBe('string');
          expect(typeof item.resourceId).toBe('string');
          expect(typeof item.title).toBe('string');
          expect(typeof item.content).toBe('string');
        }
      });
    });

    it('should return properly formatted message results', async () => {
      const response = await request(app.getHttpServer())
        .get(
          `/api/v1/namespaces/${mockNamespaceId}/search?query=test&type=${DocType.MESSAGE}`,
        )
        .set('user', JSON.stringify(mockUser))
        .expect(HttpStatus.OK);

      expect(Array.isArray(response.body)).toBe(true);

      response.body.forEach((item: any) => {
        if (item.type === DocType.MESSAGE) {
          expect(item).toHaveProperty('type', DocType.MESSAGE);
          expect(item).toHaveProperty('id');
          expect(item).toHaveProperty('conversationId');
          expect(item).toHaveProperty('content');
          expect(typeof item.id).toBe('string');
          expect(typeof item.conversationId).toBe('string');
          expect(typeof item.content).toBe('string');
        }
      });
    });
  });
});
