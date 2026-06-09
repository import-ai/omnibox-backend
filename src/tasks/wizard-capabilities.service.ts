import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';

interface WizardCapabilities {
  functions: string[];
  file_reader?: { extensions: string[] };
}

@Injectable()
export class WizardCapabilitiesService {
  private readonly baseUrl: string;
  private readonly proBaseUrl: string | undefined;

  constructor(configService: ConfigService) {
    this.baseUrl = configService.getOrThrow<string>('OBB_WIZARD_BASE_URL');
    this.proBaseUrl = configService.get<string>('OBB_WIZARD_PRO_BASE_URL');
  }

  private checkCapabilities(
    caps: WizardCapabilities,
    functionName: string,
    fileName?: string,
  ): boolean {
    if (!caps.functions.includes(functionName)) {
      return false;
    }
    if (functionName === 'file_reader' && fileName) {
      const ext = path.extname(fileName).toLowerCase();
      if (!caps.file_reader?.extensions.includes(ext)) {
        return false;
      }
    }
    return true;
  }

  async isSupported(functionName: string, fileName?: string): Promise<boolean> {
    try {
      const caps = await this.getWizardCapabilities();
      if (this.checkCapabilities(caps, functionName, fileName)) {
        return true;
      }

      const proCaps = await this.getProCapabilities();
      if (proCaps && this.checkCapabilities(proCaps, functionName, fileName)) {
        return true;
      }
      return false;
    } catch {
      return true;
    }
  }

  private getWizardCapabilities(): Promise<WizardCapabilities> {
    return this.fetchCapabilities(
      `${this.baseUrl}/internal/api/v1/wizard/functions`,
    );
  }

  private getProCapabilities(): Promise<WizardCapabilities | null> {
    if (!this.proBaseUrl) {
      return Promise.resolve(null);
    }
    return this.fetchCapabilities(
      `${this.proBaseUrl}/internal/api/v1/wizard/functions`,
    );
  }

  private async fetchCapabilities(url: string): Promise<WizardCapabilities> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch wizard capabilities: ${response.status}`,
      );
    }
    return response.json();
  }
}
