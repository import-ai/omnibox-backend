import { Expose } from 'class-transformer';
import { NamespaceRole } from 'omniboxd/namespaces/entities/namespace-member.entity';

export class MeNamespaceResponseDto {
  @Expose({ name: 'user_id' })
  userId: string;

  @Expose({ name: 'namespace_id' })
  namespaceId: string;

  email: string | null;

  username: string;

  role: NamespaceRole;
}
