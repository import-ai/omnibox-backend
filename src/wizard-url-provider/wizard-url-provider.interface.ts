import { WizardAgentRequestDto } from 'omniboxd/wizard/dto/agent-request.dto';

export const WIZARD_URL_PROVIDER = Symbol('WIZARD_URL_PROVIDER');

export interface IWizardUrlProvider {
  getBaseUrl(
    namespaceId?: string,
    agentRequest?: WizardAgentRequestDto,
  ): Promise<string>;
}
