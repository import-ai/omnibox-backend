import * as path from 'path';
import { Inject, Injectable } from '@nestjs/common';
import {
  IWizardUrlProvider,
  WIZARD_URL_PROVIDER,
} from 'omniboxd/wizard-url-provider/wizard-url-provider.interface';

interface WizardCapabilities {
  functions: string[];
  file_reader?: { extensions: string[] };
}

@Injectable()
export class WizardCapabilitiesService {
  constructor(
    @Inject(WIZARD_URL_PROVIDER)
    private readonly wizardUrlProvider: IWizardUrlProvider,
  ) {}

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
    const caps = await this.getWizardCapabilities();
    if (this.checkCapabilities(caps, functionName, fileName)) {
      return true;
    }

    const proCaps = await this.getProCapabilities();
    if (proCaps && this.checkCapabilities(proCaps, functionName, fileName)) {
      return true;
    }
    return false;
  }

  private async getWizardCapabilities(): Promise<WizardCapabilities> {
    const baseUrl = await this.wizardUrlProvider.getBaseUrl();
    return this.fetchCapabilities(
      `${baseUrl}/internal/api/v1/wizard/functions`,
    );
  }

  private async getProCapabilities(): Promise<WizardCapabilities | null> {
    const baseUrl = await this.wizardUrlProvider.getProBaseUrl();
    if (!baseUrl) {
      return null;
    }
    return this.fetchCapabilities(
      `${baseUrl}/internal/api/v1/wizard/functions`,
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
