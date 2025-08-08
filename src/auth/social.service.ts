import { EntityManager } from 'typeorm';
import generateId from 'omniboxd/utils/generate-id';
import { UserService } from 'omniboxd/user/user.service';
import { WechatCheckResponseDto } from 'omniboxd/auth/dto/wechat-login.dto';
import { Injectable, InternalServerErrorException } from '@nestjs/common';

@Injectable()
export class SocialService {
  private readonly minUsernameLength = 2;
  private readonly maxUsernameLength = 32;
  private readonly states = new Map<
    string,
    {
      type: string;
      createdAt: number;
      expiresIn: number;
      userInfo?: WechatCheckResponseDto['user'];
    }
  >();

  constructor(protected readonly userService: UserService) {}

  protected cleanExpiresState() {
    const now = Date.now();
    for (const [state, info] of this.states.entries()) {
      if (now - info.createdAt > info.expiresIn) {
        this.states.delete(state);
      }
    }
  }

  protected setState(type: string) {
    const state = generateId();
    this.states.set(state, {
      type,
      createdAt: Date.now(),
      expiresIn: 5 * 60 * 1000, // Expires in 5 minutes
    });
    return state;
  }

  protected getState(state: string) {
    return this.states.get(state);
  }

  private generateSuffix(): string {
    return (
      '_' +
      generateId(4, 'useandomTPXpxJACKVERYMINDBUSHWOLFGQZbfghjklqvwyzrict')
    );
  }

  protected async getValidUsername(
    nickname: string,
    manager: EntityManager,
  ): Promise<string> {
    let username = nickname;

    if (username.length > this.maxUsernameLength) {
      username = nickname.slice(0, this.maxUsernameLength);
    }
    if (username.length >= this.minUsernameLength) {
      const user = await this.userService.findByUsername(username, manager);
      if (!user) {
        return username;
      }
    }

    username = nickname.slice(0, this.maxUsernameLength - 5);
    for (let i = 0; i < 5; i++) {
      const suffix = this.generateSuffix();
      const user = await this.userService.findByUsername(
        username + suffix,
        manager,
      );
      if (!user) {
        return username + suffix;
      }
    }

    throw new InternalServerErrorException(
      'Unable to generate a valid username',
    );
  }
}
