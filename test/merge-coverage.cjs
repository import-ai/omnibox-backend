const fs = require('node:fs');
const { createCoverageMap } = require('istanbul-lib-coverage');
const { createContext } = require('istanbul-lib-report');
const reports = require('istanbul-reports');

const inputs = process.argv.slice(2);
if (inputs.length !== 4) {
  throw new Error('Expected coverage JSON from all four shards');
}
const coverageMap = createCoverageMap({});
for (const input of inputs) {
  coverageMap.merge(JSON.parse(fs.readFileSync(input, 'utf8')));
}
const context = createContext({ dir: 'coverage', coverageMap });
for (const reporter of ['json', 'lcov', 'text-summary']) {
  reports.create(reporter).execute(context);
}
