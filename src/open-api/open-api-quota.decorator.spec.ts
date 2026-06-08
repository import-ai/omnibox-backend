import 'reflect-metadata';
import { OpenAPIKeyController } from 'omniboxd/api-key/open.api-key.controller';
import { OpenResourcesController } from 'omniboxd/namespace-resources/open.resource.controller';
import { SKIP_OPEN_API_QUOTA } from 'omniboxd/open-api/open-api-quota.decorator';
import { OpenSkillController } from 'omniboxd/open-api/open.skill.controller';
import { OpenWizardController } from 'omniboxd/wizard/open.wizard.controller';

describe('Open API quota skip decorators', () => {
  const hasClassSkip = (target: object) =>
    Reflect.getMetadata(SKIP_OPEN_API_QUOTA, target) === true;

  const hasMethodSkip = (target: object, methodName: string) =>
    Reflect.getMetadata(
      SKIP_OPEN_API_QUOTA,
      (target as Record<string, any>)[methodName],
    ) === true;

  it('skips quota for API key management and skill document endpoints', () => {
    expect(hasClassSkip(OpenAPIKeyController)).toBe(true);
    expect(hasClassSkip(OpenSkillController)).toBe(true);
  });

  it('skips quota for wizard endpoints', () => {
    expect(hasClassSkip(OpenWizardController)).toBe(true);
  });

  it('skips quota for resource creation endpoints only', () => {
    expect(hasMethodSkip(OpenResourcesController.prototype, 'create')).toBe(
      true,
    );
    expect(hasMethodSkip(OpenResourcesController.prototype, 'uploadFile')).toBe(
      true,
    );

    expect(hasMethodSkip(OpenResourcesController.prototype, 'list')).toBe(
      false,
    );
    expect(hasMethodSkip(OpenResourcesController.prototype, 'get')).toBe(false);
    expect(hasMethodSkip(OpenResourcesController.prototype, 'update')).toBe(
      false,
    );
    expect(hasMethodSkip(OpenResourcesController.prototype, 'delete')).toBe(
      false,
    );
  });
});
