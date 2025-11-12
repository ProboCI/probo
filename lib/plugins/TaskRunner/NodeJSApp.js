'use strict';

const Path = require('path');
const Script = require('./Script');

class NodeJSApp extends Script {
  /**
   * Options (used by this task):
   *   @param {object} container - An instantiated and configured Container object.
   *   @param {object} options - A hash of configuration options specific to this task.
   */
  constructor(container, options) {
    super(container, options);

    // Allow for subdirectory to be explicitly set to "" without being overwritten for being falsy.
    this.subDirectory = options.subDirectory || 'app';
    this.buildCommand = options.buildCommand || 'npm i';
    this.runCommand = options.runCommand ||  'npm run dev';
    this.environment = options.environment || {};
    this.packages = options.globalPackages || {};
    this.script = [];
    this.setEnvironmentVariables();
    this.installPackages();
    this.buildApplication();
    this.runApplication();
    this.setScript(this.script);
  }

  description() {
    return `${this.plugin} 'Provisioning NodeJS Application!'`;
  }

  // Environment variables do not persist from the container to the application and
  // must be specified via command line when building the application. This method
  // constructs those flags and appends them to the build command in buildNodeJS.
  // It also saves the output as a string for subsequent starts via proboscis.
  setEnvironmentVariables() {
    const envVariables = this.environment;
    let string = "echo 'cd /src/" + this.subDirectory + "; ";
    let key = null;
    if (!this.isEmptyObject(envVariables)) {
      for (key in envVariables) {
        string += key  + '="' + envVariables[key] + '" ';
      }
      string += this.runCommand + "' > /src/startup.sh";
    }
    this.script.push(string);
  }

  // Build the application with our command
  buildApplication() {
    this.script = this.script.concat([
      'cd $SRC_DIR/' + this.subDirectory,
      this.buildCommand,
    ]);
  }

  // Run the application
  runApplication() {
    this.script = this.script.concat([
      'cd $SRC_DIR',
      'chmod 755 startup.sh',
      'bash startup.sh',
    ]);
  }

  // If we have packages to install (yum being the obvious) then install them globally
  // so they can be used elsewhere in the build.
  installPackages() {
    if (!this.isEmptyObject(this.packages)) {
      this.packages.forEach(globalPackage => {
        this.script.push('npm install -g ' + globalPackage);
      });
    }
  }

  // Helper function to determine if objects are empty.
  isEmptyObject(o) {
    return !Object.keys(o).length;
  }

  // Helper functions to sanitize strings
  sanitizeValue(val) {
    if (typeof val === 'string') {
      val = val.replace(/'/g, "\\'");
      val = val.replace(/"/g, '\\"');
      val = "'" + val + "'";
    }
    return val;
  }
}

module.exports = NodeJSApp;
