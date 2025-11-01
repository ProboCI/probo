'use strict';

const Path = require('path');
const Script = require('./Script');

class Dotnet extends Script {
  /**
   * Options (used by this task):
   *   @param {object} container - An instantiated and configured Container object.
   *   @param {object} options - A hash of configuration options specific to this task.
   */
  constructor(container, options) {
    super(container, options);

    // Allow for subdirectory to be explicitly set to "" without being overwritten for being falsy.
    this.subDirectory = options.subDirectory || 'app';
    this.script = [];
    this.runDotnet();
    this.setScript(this.script);
  }

  description() {
    return `${this.plugin} 'Provisioning Dotnet Application!'`;
  }

  runDotnet() {
    this.script = this.script.concat([
      'cd $SRC_DIR/' + this.subDirectory,
      'dotnet run --urls=http://localhost:5000 &',
    ]);
  }

  isEmptyObject(o) {
    return !Object.keys(o).length;
  }

  sanitizeValue(val) {
    if (typeof val === 'string') {
      val = val.replace(/'/g, "\\'");
      val = val.replace(/"/g, '\\"');
      val = "'" + val + "'";
    }
    return val;
  }
}

module.exports = Dotnet;
