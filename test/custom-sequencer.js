const Sequencer = require('@jest/test-sequencer').default;

const isBootstrap = (test) =>
  test.path.endsWith('database-bootstrap.e2e-spec.ts') ||
  test.path.endsWith('database-bootstrap.e2e-spec.js');

class CustomSequencer extends Sequencer {
  shard(tests, options) {
    const bootstrap = tests.find(isBootstrap);
    if (!bootstrap) {
      throw new Error('Sharding requires the database bootstrap test');
    }
    return [
      bootstrap,
      ...super.shard(
        tests.filter((test) => !isBootstrap(test)),
        options,
      ),
    ];
  }

  sort(tests) {
    return [...tests].sort(
      (a, b) =>
        Number(isBootstrap(b)) - Number(isBootstrap(a)) ||
        a.path.localeCompare(b.path),
    );
  }
}

module.exports = CustomSequencer;
