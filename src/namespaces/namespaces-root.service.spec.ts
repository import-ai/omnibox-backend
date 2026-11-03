import { NamespacesService } from './namespaces.service';

describe('NamespacesService root visibility', () => {
  it.each([
    { members: 1, children: [], visible: false },
    { members: 1, children: [{ id: 'retained-document' }], visible: true },
    { members: 2, children: [], visible: true },
    { members: 2, children: [{ id: 'team-document' }], visible: true },
  ])(
    'returns Team=$visible for $members members and children=$children',
    async ({ members, children, visible }) => {
      const countBy = jest.fn().mockResolvedValue(members);
      const service: NamespacesService = Object.assign(
        Object.create(NamespacesService.prototype),
        {
          getPrivateRoot: jest.fn().mockResolvedValue({ id: 'personal' }),
          getTeamspaceRoot: jest.fn().mockResolvedValue({ id: 'team' }),
          namespaceMemberRepository: { countBy },
          resourceSortPreferenceService: {
            getSortOptions: jest.fn().mockResolvedValue(undefined),
          },
          namespaceResourcesService: {
            listChildren: jest
              .fn()
              .mockImplementation((_, rootId: string) =>
                Promise.resolve(rootId === 'team' ? children : []),
              ),
          },
        },
      );

      const roots = await service.getRoot('namespace', 'owner');

      expect(roots.private.id).toBe('personal');
      expect(roots.teamspace !== undefined).toBe(visible);
      if (visible) {
        expect(roots.teamspace).toMatchObject({ id: 'team', children });
      }
    },
  );
});
