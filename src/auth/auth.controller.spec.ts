import { HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { I18nService } from 'nestjs-i18n';
import { NamespaceRole } from 'omniboxd/namespaces/entities/namespace-member.entity';
import { NamespacesService } from 'omniboxd/namespaces/namespaces.service';
import { ResourcePermission } from 'omniboxd/permissions/resource-permission.enum';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { InviteDto } from './dto/invite.dto';

describe('AuthController invitation roles', () => {
  const inviteBatch = jest.fn();
  const inviteGroup = jest.fn();
  const getMemberByUserId = jest.fn();
  let controller: AuthController;

  beforeEach(() => {
    jest.resetAllMocks();
    getMemberByUserId.mockResolvedValue({ role: NamespaceRole.ADMIN });
    controller = new AuthController(
      { inviteBatch, inviteGroup } as unknown as AuthService,
      {} as ConfigService,
      { getMemberByUserId } as unknown as NamespacesService,
      {
        t: () => 'You cannot assign an equal or higher role',
      } as unknown as I18nService,
    );
  });

  function invite(role: NamespaceRole, extra: Partial<InviteDto> = {}) {
    return controller.invite(
      { user: { id: 'sender' } },
      {
        namespace: 'space',
        role,
        emails: ['recipient@example.com'],
        inviteUrl: 'http://localhost/invite/confirm',
        registerUrl: 'http://localhost/user/accept-invite',
        permission: ResourcePermission.CAN_VIEW,
        ...extra,
      },
    );
  }

  it.each([NamespaceRole.ADMIN, NamespaceRole.OWNER])(
    'rejects an admin inviting %s before sending mail or granting permissions',
    async (role) => {
      await expect(
        invite(role, { groupTitles: ['group'], resourceId: 'resource' }),
      ).rejects.toMatchObject({
        status: HttpStatus.FORBIDDEN,
        code: 'CANNOT_ASSIGN_HIGHER_ROLE',
      });
      expect(getMemberByUserId).toHaveBeenCalledWith('space', 'sender');
      expect(inviteBatch).not.toHaveBeenCalled();
      expect(inviteGroup).not.toHaveBeenCalled();
    },
  );

  it('allows an admin to invite a member', async () => {
    await invite(NamespaceRole.MEMBER);
    expect(inviteBatch).toHaveBeenCalledWith(
      'sender',
      ['recipient@example.com'],
      expect.objectContaining({ role: NamespaceRole.MEMBER }),
    );
  });

  it.each([NamespaceRole.ADMIN, NamespaceRole.MEMBER])(
    'preserves owner invitations to %s',
    async (role) => {
      getMemberByUserId.mockResolvedValue({ role: NamespaceRole.OWNER });
      await invite(role);
      expect(inviteBatch).toHaveBeenCalledWith(
        'sender',
        ['recipient@example.com'],
        expect.objectContaining({ role }),
      );
    },
  );

  it('does not allow inviting another owner', async () => {
    getMemberByUserId.mockResolvedValue({ role: NamespaceRole.OWNER });
    await expect(invite(NamespaceRole.OWNER)).rejects.toMatchObject({
      status: HttpStatus.FORBIDDEN,
    });
    expect(inviteBatch).not.toHaveBeenCalled();
  });

  it.each([NamespaceRole.MEMBER, null])(
    'rejects invitations from a member or non-member (%s)',
    async (role) => {
      getMemberByUserId.mockResolvedValue(role ? { role } : null);
      await expect(invite(NamespaceRole.MEMBER)).rejects.toMatchObject({
        status: HttpStatus.FORBIDDEN,
        code: 'USER_NOT_OWNER_OR_ADMIN',
      });
      expect(inviteBatch).not.toHaveBeenCalled();
    },
  );

  it('preserves group resource permission invitations', async () => {
    await invite(NamespaceRole.MEMBER, {
      emails: [],
      groupTitles: ['group'],
      resourceId: 'resource',
    });
    expect(inviteGroup).toHaveBeenCalledWith(
      'space',
      'resource',
      ['group'],
      ResourcePermission.CAN_VIEW,
    );
    expect(inviteBatch).not.toHaveBeenCalled();
  });
});
