const Sequencer = require('@jest/test-sequencer').default;

class CustomSequencer extends Sequencer {
  sort(tests) {
    return [...tests].sort((a, b) => {
      return a.path.localeCompare(b.path);
    });
  }
}

module.exports = CustomSequencer;
