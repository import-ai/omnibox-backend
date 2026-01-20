import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OAuthPairwiseSubject } from './entities/oauth-pairwise-subject.entity';
import generateId from 'omniboxd/utils/generate-id';

@Injectable()
export class PairwiseSubjectService {
  constructor(
    @InjectRepository(OAuthPairwiseSubject)
    private readonly repository: Repository<OAuthPairwiseSubject>,
  ) {}

  async getOrCreate(userId: string, clientId: string): Promise<string> {
    const existing = await this.repository.findOne({
      where: { userId, clientId },
    });

    if (existing) {
      return existing.pairwiseSubject;
    }

    const pairwiseSubject = generateId(12);

    try {
      const entity = this.repository.create({
        userId,
        clientId,
        pairwiseSubject,
      });
      await this.repository.save(entity);
      return pairwiseSubject;
    } catch (error) {
      // Handle race condition: another request may have created the mapping
      if (
        error instanceof Error &&
        error.message.includes('duplicate key value')
      ) {
        const created = await this.repository.findOne({
          where: { userId, clientId },
        });
        if (created) {
          return created.pairwiseSubject;
        }
      }
      throw error;
    }
  }
}
