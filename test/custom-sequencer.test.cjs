const assert = require('node:assert/strict');
const path = require('node:path');
const { test } = require('node:test');
const Sequencer = require('./custom-sequencer');

test('runs bootstrap first on every shard without losing or duplicating other suites', () => {
  const sequencer = new Sequencer();
  const makeTest = (name) => ({
    path: path.join(__dirname, name),
    context: { config: { rootDir: __dirname } },
  });
  for (const extension of ['ts', 'js']) {
    const bootstrap = makeTest(`database-bootstrap.e2e-spec.${extension}`);
    const suites = Array.from({ length: 17 }, (_, n) =>
      makeTest(`${n}.spec.${extension}`),
    );
    const input = [...suites, bootstrap];
    const assigned = [];
    for (let shardIndex = 1; shardIndex <= 4; shardIndex++) {
      const shard = sequencer.sort(
        sequencer.shard(input, { shardIndex, shardCount: 4 }),
      );
      assert.equal(shard[0], bootstrap);
      assert.equal(shard.filter((suite) => suite === bootstrap).length, 1);
      assigned.push(...shard.slice(1));
    }
    assert.equal(assigned.length, suites.length);
    assert.deepEqual(new Set(assigned), new Set(suites));
    assert.equal(sequencer.sort(input)[0], bootstrap);
    assert.throws(() =>
      sequencer.shard(suites, { shardIndex: 1, shardCount: 4 }),
    );
  }
});
