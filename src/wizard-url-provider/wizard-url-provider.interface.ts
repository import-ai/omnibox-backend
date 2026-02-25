export const WIZARD_URL_PROVIDER = Symbol('WIZARD_URL_PROVIDER');

export interface IWizardUrlProvider {
  getBaseUrl(userId: string | null): Promise<string>;
}
