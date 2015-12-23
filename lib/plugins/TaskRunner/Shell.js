'use strict';

var AbstractPlugin = require('./AbstractPlugin');

class Shell extends AbstractPlugin {
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
