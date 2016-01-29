'use strict';

var lib = require('../..');
var AbstractStep = lib.plugins.Step.AbstractStep;

class TestStep extends AbstractStep {

  buildCommand() {
    return [];
  }

  _run(done) {
    var self = this;
    var error = null;
    this.state = 'running';
    this.emit('start');
    var prefix = this.options.prefix || '';
    for (let i = 1 ; i < 3 ; i++) {
      this.stdout.write(prefix + 'stdout input line ' + i);
      this.stderr.write(prefix + 'stderr input line ' + i);
    }
    this.stdout.end();
    this.stderr.end();
    this.emit('end');
    this.state = 'completed';
    if (this.options.fail) {
      this.state = 'errored';
      error = new Error('Task failed');
    }
    var data = {
      exitCode: self.error == null ? 0 : 1,
    };
    if (this.options.delay) {
      setTimeout(function() {
        done(self.error, data);
      }, this.options.delay);
      return;
    }
    done(error, data);
  }

}

module.exports = TestStep;
