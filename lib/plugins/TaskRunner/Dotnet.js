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
    this.environment = options.environment || {};
    this.environmentVariables = "";
    this.script = [];
    this.setEnvironmentVariables();
    this.buildDotNet();
    this.setScript(this.script);
  }

  description() {
    return `${this.plugin} 'Provisioning Dotnet Application!'`;
  }

  // Environment variables do not persist from the container to the application and
  // must be specified via the -e flag when building the application. This method
  // constructs those flags and appends them to the build command in buildDotNet.
  // It also saves the output as a string for subsequent starts via proboscis.
  setEnvironmentVariables() {
    const envVariables = this.environment;
    let string = null;
    let key = null;
    if (!this.isEmptyObject(envVariables)) {
      string = 'echo "cd /src/' + this.subDirectory + '; dotnet run ';
      for (key in envVariables) {
        string += '-e  ' + key + '="' + envVariables[key] + '" ";
      }
      string += '--urls=http://localhost:5000" > /src/.env';
    }
    console.log(string);
    this.script.push(string);
  }

  // Run the dotnet application.
  buildDotNet() {
    this.script = this.script.concat([
      'cd $SRC_DIR/' + this.subDirectory,
      'dotnet build'
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
