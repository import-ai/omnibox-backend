import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { NamespaceMember } from "./namespace-members.entity";

@Injectable()
export class NamespaceMemberService {
  constructor(
    @InjectRepository(NamespaceMember)
    private namespaceMemberRepository: Repository<NamespaceMember>,
  ) { }

  async create(member: NamespaceMember) {
    await this.namespaceMemberRepository.save(member);
  }

  async getRootResource(namespace: string, userId: string | null) {
    const member = await this.namespaceMemberRepository.findOne({
      where: {
        namespace: { id: namespace },
        user: userId === null ? IsNull() : { id: userId },
      },
      relations: ['rootResource']
    });
    if (!member) {
      throw new NotFoundException('Root resource not found.');
    }
    return member.rootResource;
  }
}
