import { CreateApplicationsDto } from 'omniboxd/applications/applications.dto';
import { Applications } from 'omniboxd/applications/applications.entity';

export abstract class BaseApp {
  protected static readonly appId: string;

  abstract getAttrs(
    namespaceId: string,
    userId: string,
    createDto: CreateApplicationsDto,
  ): Promise<Record<string, any>>;

  abstract getApplicationByKey(key: string): Promise<Applications | null>;

  abstract callback(data: Record<string, any>): Promise<Record<string, any>>;

  postDelete?(application: Applications): Promise<void>;
}
