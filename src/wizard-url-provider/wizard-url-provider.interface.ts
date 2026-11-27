import { WizardAgentRequestDto } from 'omniboxd/wizard/dto/agent-request.dto';

export const WIZARD_URL_PROVIDER = Symbol('WIZARD_URL_PROVIDER');

export type WizardTarget = 'core' | 'pro';

export interface WizardBaseUrlResolution {
  baseUrl: string;
  target: WizardTarget;
}

export interface IWizardUrlProvider {
  readonly submissionPool?: WizardTarget;
  getBaseUrl(
    namespaceId?: string,
    agentRequest?: WizardAgentRequestDto,
  ): Promise<string>;
  /**
   * Resolves this turn's agent target. Implementations that reserve credits
   * must complete that reservation here, and only here.
   */
  resolveAgentTarget(
    namespaceId?: string,
    agentRequest?: WizardAgentRequestDto,
  ): Promise<WizardBaseUrlResolution>;
}
