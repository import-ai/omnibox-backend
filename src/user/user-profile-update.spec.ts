import * as bcrypt from 'bcrypt';
import { IsNull } from 'typeorm';

import { UserService } from './user.service';

jest.mock('bcrypt', () => ({ hash: jest.fn().mockResolvedValue('hashed') }));

function serviceWithRepository() {
  const repository = { update: jest.fn().mockResolvedValue({ affected: 1 }) };
  const service = new UserService(
    repository as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  jest.spyOn(service, 'find').mockResolvedValue({
    id: 'user',
    username: 'stale',
    password: 'old',
  } as never);
  return { service, repository };
}

it('does not write a stale username when updating a password', async () => {
  const { service, repository } = serviceWithRepository();
  await service.updatePassword('user', 'new-password');
  expect(bcrypt.hash).toHaveBeenCalledWith('new-password', 10);
  expect(repository.update).toHaveBeenCalledWith(
    { id: 'user', deletedAt: IsNull() },
    { password: 'hashed' },
  );
});

it('limits profile writes to requested fields and excludes deleted accounts', async () => {
  const { service, repository } = serviceWithRepository();
  await service.update('user', { password: 'new-password' });
  expect(repository.update).toHaveBeenCalledWith(
    { id: 'user', deletedAt: IsNull() },
    { password: 'hashed' },
  );
});
