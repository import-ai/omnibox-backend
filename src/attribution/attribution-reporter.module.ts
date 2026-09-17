import { Global, Module } from '@nestjs/common';

import { AttributionReporter } from './attribution-reporter.service';

@Global()
@Module({
  providers: [AttributionReporter],
  exports: [AttributionReporter],
})
export class AttributionReporterModule {}
