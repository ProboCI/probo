'use strict';

var lib = require('../..');
var AbstractPlugin = lib.plugins.TaskRunner.AbstractPlugin;

class Step extends AbstractPlugin {

  buildCommand() {
    return [];
  }

  _run(done) {
    var self = this;
    var error = null;
    this.state = 'running';
    this.emit('start');
    this.stdOutStream.write('stdout input line 1');
    this.stdErrStream.write('stderr input line 1');
    this.stdOutStream.write('stdout input line 2');
    this.stdErrStream.write('stderr input line 2');
    this.stdOutStream.end();
    this.stdErrStream.end();
    this.emit('end');
    this.state = 'completed';
    if (this.options.fail) {
      this.state = 'errored';
      error = new Error('Task failed');
    }
    if (this.options.delay) {
      setTimeout(function() {
        // TODO: This sucks.
        if (this.runCalledDone) {
          done(self.error);
        }
      }, this.options.delay);
      return;
    }
    done(error);
  }

}

module.exports = Step;
