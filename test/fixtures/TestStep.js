'use strict';

var lib = require('../..');
var AbstractStep = lib.plugins.Step.AbstractStep;

class Step extends AbstractStep {

  buildCommand() {
    return [];
  }

  _run(done) {
    var self = this;
    var error = null;
    this.state = 'running';
    this.emit('start');
    this.stdout.write('stdout input line 1');
    this.stderr.write('stderr input line 1');
    this.stdout.write('stdout input line 2');
    this.stderr.write('stderr input line 2');
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

module.exports = Step;
