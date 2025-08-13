import { Index } from 'omniboxd/resources/wizard-task/index.service';
import { Reader } from 'omniboxd/resources/wizard-task/reader.service';
import { TagExtract } from 'omniboxd/resources/wizard-task/tag-extract.service';

export class WizardTask {
  public static readonly index: typeof Index = Index;
  public static readonly reader: typeof Reader = Reader;
  public static readonly tagExtract: typeof TagExtract = TagExtract;
}
