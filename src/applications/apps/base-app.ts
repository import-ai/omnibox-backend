import { CreateApplicationsDto } from 'omniboxd/applications/applications.dto';

export abstract class BaseApp {
  abstract getAttrs(
    namespaceId: string,
    userId: string,
    createDto: CreateApplicationsDto,
  ): Promise<Record<string, any>>;

  abstract callback(data: Record<string, any>): Promise<Record<string, any>>;
}
