'use strict';

module.exports = class Output extends require('./AbstractPlugin') {
  constructor(container, options) {
    super(container, options);
  }

  buildCommand() {
    // If docker exec ever supports specifying the cwd then switch to that.
    return ['bash', '-c', 'echo "' + this.options.output + '"'];
  }

  description() {
    return this.options.output;
  }
};
