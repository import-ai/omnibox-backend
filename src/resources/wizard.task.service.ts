import { Index } from 'omnibox-backend/resources/wizard-task/index.service';
import { Reader } from 'omnibox-backend/resources/wizard-task/reader.service';

export class WizardTask {
  public static readonly index: typeof Index = Index;
  public static readonly reader: typeof Reader = Reader;
}
