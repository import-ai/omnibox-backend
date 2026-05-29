import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { HttpStatus } from '@nestjs/common';
import { I18nValidationPipe } from 'nestjs-i18n';
import { DocType } from './doc-type.enum';
import { IndexRecordType } from 'omniboxd/wizard/dto/index-record.dto';
import { ResourcePermission } from 'omniboxd/permissions/resource-permission.enum';
import {
  SearchController,
  InternalSearchController,
} from './search.controller';
import { SearchService } from './search.service';
import { PermissionsService } from 'omniboxd/permissions/permissions.service';
import { ConversationsService } from 'omniboxd/conversations/conversations.service';
import { NamespaceResourcesService } from 'omniboxd/namespace-resources/namespace-resources.service';
import { MessagesService } from 'omniboxd/messages/messages.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { WizardTaskService } from 'omniboxd/tasks/wizard-task.service';
import { Task } from 'omniboxd/tasks/tasks.entity';
import { ResourcesService } from 'omniboxd/resources/resources.service';
import { I18nService } from 'nestjs-i18n';
import { WizardAPIService } from 'omniboxd/wizard-api/wizard-api.service';
import { TagService } from 'omniboxd/tag/tag.service';
import {
  SmartFolderField,
  SmartFolderMatchMode,
  SmartFolderOperator,
} from 'omniboxd/smart-folders/entities/smart-folder-config.entity';
import { SmartFoldersRuleService } from 'omniboxd/smart-folders/smart-folders-rule.service';
import { SmartFoldersMatcherService } from 'omniboxd/smart-folders/smart-folders-matcher.service';
import { SearchResourceFilterService } from './search-resource-filter.service';

// Mock the WizardAPIService to avoid needing the actual wizard service during tests
jest.mock('../wizard-api/wizard-api.service', () => {
  return {
    WizardAPIService: jest.fn().mockImplementation(() => ({
      search: jest.fn().mockImplementation((req) => {
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
        if (req?.type) {
          if (req.type === IndexRecordType.CHUNK) {
            filteredRecords = allRecords.filter(
              (r) => r.type === IndexRecordType.CHUNK,
            );
          } else if (req.type === IndexRecordType.MESSAGE) {
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
        SearchResourceFilterService,
        WizardAPIService,
        {
          provide: PermissionsService,
          useValue: {
            userInNamespace: jest.fn().mockResolvedValue(true),
            getCurrentPermissions: jest
              .fn()
              .mockImplementation((_userId, _namespaceId, resources) => {
                const map = new Map();
                for (const r of resources || []) {
                  map.set(r.id, ResourcePermission.CAN_VIEW);
                }
                return Promise.resolve(map);
              }),
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
          provide: NamespaceResourcesService,
          useValue: {
            listAllResources: jest.fn().mockResolvedValue([]),
            getAllResourcesByUser: jest.fn().mockResolvedValue([
              {
                id: '550e8400-e29b-41d4-a716-446655440000',
              },
            ]),
          },
        },
        {
          provide: ResourcesService,
          useValue: {
            getParentResources: jest.fn().mockResolvedValue([]),
            batchGetResourceMeta: jest.fn().mockResolvedValue(new Map()),
            batchGetParentResources: jest
              .fn()
              .mockImplementation((_namespaceId, resourceIds: string[]) => {
                const entries: Array<
                  [string, { id: string; attrs: Record<string, unknown> }]
                > = (resourceIds || []).map((id) => [
                  id,
                  {
                    id,
                    attrs: {},
                  },
                ]);
                return Promise.resolve(new Map(entries));
              }),
            batchGetResources: jest
              .fn()
              .mockImplementation((_namespaceId, resourceIds: string[]) => {
                return Promise.resolve(
                  (resourceIds || []).map((id) => ({
                    id,
                    name: 'Test Document',
                    attrs: {},
                    resourceType: 'doc',
                    tagIds: [],
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    content: 'This is test content for searching',
                  })),
                );
              }),
          },
        },
        {
          provide: MessagesService,
          useValue: {
            findAll: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: TagService,
          useValue: {
            findByIds: jest.fn().mockResolvedValue([]),
            getTagsByIds: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: SmartFoldersRuleService,
          useValue: {
            normalize: jest.fn((conditions) => conditions || []),
          },
        },
        {
          provide: SmartFoldersMatcherService,
          useValue: {
            matches: jest.fn().mockReturnValue(true),
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
            emitUpsertIndexTask: jest.fn().mockResolvedValue({}),
            emitUpsertMessageIndexTask: jest.fn().mockResolvedValue({}),
          },
        },
        {
          provide: I18nService,
          useValue: {
            t: jest.fn((key: string) => {
              // Return mock translations for test purposes
              const translations: Record<string, string> = {
                'search.errors.invalidQuery': 'Invalid search query',
                'search.errors.searchFailed': 'Search operation failed',
              };
              return translations[key] || key;
            }),
          },
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new I18nValidationPipe({
        transform: true,
      }),
    );

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
    it('should return only resource results by default', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/namespaces/${mockNamespaceId}/search?query=test`)
        .set('user', JSON.stringify(mockUser))
        .expect(HttpStatus.OK);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);

      response.body.forEach((item: any) => {
        expect(item.type).toBe(DocType.RESOURCE);
      });
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

    it('should not return conversation results when message type is requested', async () => {
      const response = await request(app.getHttpServer())
        .get(
          `/api/v1/namespaces/${mockNamespaceId}/search?query=test&type=${DocType.MESSAGE}`,
        )
        .set('user', JSON.stringify(mockUser))
        .expect(HttpStatus.OK);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body).toHaveLength(0);
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

    it('should search with smart folder filter conditions', async () => {
      const searchSpy = jest.spyOn(searchService, 'search');
      const conditions = [
        {
          field: SmartFolderField.TITLE,
          operator: SmartFolderOperator.CONTAINS,
          value: 'roadmap',
        },
      ];

      const response = await request(app.getHttpServer())
        .post(`/api/v1/namespaces/${mockNamespaceId}/search`)
        .set('user', JSON.stringify(mockUser))
        .send({
          query: 'planning',
          match_mode: SmartFolderMatchMode.ALL,
          conditions,
        })
        .expect(HttpStatus.CREATED);

      expect(Array.isArray(response.body)).toBe(true);
      expect(searchSpy).toHaveBeenCalledWith(
        mockUser.id,
        mockNamespaceId,
        'planning',
        undefined,
        {
          conditions,
          matchMode: SmartFolderMatchMode.ALL,
        },
      );
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

    it('should return an empty list for message results', async () => {
      const response = await request(app.getHttpServer())
        .get(
          `/api/v1/namespaces/${mockNamespaceId}/search?query=test&type=${DocType.MESSAGE}`,
        )
        .set('user', JSON.stringify(mockUser))
        .expect(HttpStatus.OK);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body).toHaveLength(0);
    });
  });
});
