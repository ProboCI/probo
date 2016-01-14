'use strict';

var AbstractStep = require('./AbstractStep');

class Shell extends AbstractStep {
  constructor(container, options) {
    super(container, options);
  }

  buildCommand() {
    // If docker exec ever supports specifying the cwd then we should switch to that.
    return ['bash', '-c', this.options.command];
  }

  description() {
    return this.options.command;
  }

}

module.exports = Shell;
