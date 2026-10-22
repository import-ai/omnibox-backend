import { ResourcesService } from './resources.service';

describe('ResourcesService.getDeletedResources', () => {
  const queryBuilder = {
    select: jest.fn().mockReturnThis(),
    withDeleted: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getCount: jest.fn().mockResolvedValue(21),
    getMany: jest.fn().mockResolvedValue([{ id: 'kept' }]),
  };
  const repository = {
    createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
  };
  const service = new ResourcesService(
    {} as never,
    repository as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    repository.createQueryBuilder.mockReturnValue(queryBuilder);
    queryBuilder.getCount.mockResolvedValue(21);
    queryBuilder.getMany.mockResolvedValue([{ id: 'kept' }]);
  });

  it('returns the whole retention window when no page is requested', async () => {
    await expect(service.getDeletedResources('namespace', 7)).resolves.toEqual({
      items: [{ id: 'kept' }],
      total: 21,
    });

    expect(queryBuilder.skip).not.toHaveBeenCalled();
    expect(queryBuilder.take).not.toHaveBeenCalled();
  });

  it('applies skip and take only for an explicit page', async () => {
    await service.getDeletedResources('namespace', 7, {
      search: 'note',
      limit: 20,
      offset: 20,
    });

    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'resource.name ILIKE :search',
      { search: '%note%' },
    );
    expect(queryBuilder.skip).toHaveBeenCalledWith(20);
    expect(queryBuilder.take).toHaveBeenCalledWith(20);
  });
});
