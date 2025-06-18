import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Invitation } from "./entities/invitation.entity";
import { Repository } from "typeorm";
import { NamespaceRole } from "src/namespaces/entities/namespace-member.entity";

@Injectable()
export class InvitationsService {
  constructor(
    @InjectRepository(Invitation)
    private readonly invitationsRepository: Repository<Invitation>,
  ) { }

}
