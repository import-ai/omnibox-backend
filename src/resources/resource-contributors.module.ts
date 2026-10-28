import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NamespaceMember } from 'omniboxd/namespaces/entities/namespace-member.entity';
import { User } from 'omniboxd/user/entities/user.entity';

import { NamespaceMemberNameSnapshot } from './entities/namespace-member-name-snapshot.entity';
import { Resource } from './entities/resource.entity';
import { ResourceCollaborator } from './entities/resource-collaborator.entity';
import { ResourceContributorsService } from './resource-contributors.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Resource,
      ResourceCollaborator,
      NamespaceMemberNameSnapshot,
      NamespaceMember,
      User,
    ]),
  ],
  providers: [ResourceContributorsService],
  exports: [ResourceContributorsService],
})
export class ResourceContributorsModule {}
