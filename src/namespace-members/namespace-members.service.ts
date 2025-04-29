import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { NamespaceMember } from "./namespace-members.entity";
import { Repository } from "typeorm";

@Injectable()
export class NamespaceMemberService {
  constructor(
    @InjectRepository(NamespaceMember)
    private namespaceMemberRepository: Repository<NamespaceMember>,
  ) { }

  async create(member: NamespaceMember) {
    await this.namespaceMemberRepository.save(member);
  }
}
