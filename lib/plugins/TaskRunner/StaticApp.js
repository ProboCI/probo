'use strict';

var Script = require('./Script');
var constants = require('./constants');


class StaticApp extends Script {


  /**
   * Options (used by this task):
   *   @param {object} container - An instantiated and configured Container object.
   *   @param {object} options - A hash of configuration options specific to this task.
   *   @param {string} [options.subDirectory] - The directory of the actual web root (defaults to 'docroot').
   *   @param {hash} [options.cliDefines] - A hash of defines, such as {define1: 'define1Value', define2: 'define2Value',}
   *   @param {array} [options.installPackages] - An array of additional packages to install.
   *   @param {boolean} [options.restartApache] - Whether to restart Apache. If phpIniOptions, phpConstants, phpMods, or apacheMods
   *      are set, Apache will be restarted automatically, so you probably won't need to use this.
   */
  constructor(container, options) {

    super(container, options);

    this.options.cliDefines = options.cliDefines || {};
    this.options.installPackages = options.installPackages || {};
    this.options.restartApache = options.restartApache || false;

    // Allow for subdirectory to be explicitly set to "" without being overwritten for being falsy.
    this.buildDirectory = options.buildDirectory || 'build';
    this.options.buildCommands = options.buildCommands || {};
    this.script = [];
    this.populateScriptArray();
    this.setScript(this.script);
  }

  description() {
    return `${this.plugin} 'Provisioning Static Application!'`;
  }

  /**
   *
   */
  populateScriptArray() {
    this.addScriptSetup();
    this.addScriptSymlinks();
    this.addScriptBuildCommands();
  }

  addScriptSymlinks() {
    this.script = this.script.concat([
      'if [ -d "$SRC_DIR/' + this.buildDirectory + '" ] ; then',
      '  echo \'buildDirectory ' + this.buildDirectory + ' found within code directory, creating symlink.\'',
      '  ln -s "$SRC_DIR/' + this.buildDirectory + '" /var/www/html',
      'fi',
    ]);
  }

  addScriptCliDefines() {
    var defines = this.options.cliDefines;
    if (!this.isEmptyObject(defines)) {
      for (var key in defines) {
        if (defines.hasOwnProperty(key)) {
          var val = this.sanitizeValue(defines[key]);
          this.script = this.script.concat(`export ${key}=${val}`);
        }
      }
    }
  }

  addScriptInstallPackages() {
    var packages = this.options.installPackages;
    if (!this.isEmptyObject(packages)) {
      var packageList = packages.join(' ');
      this.script = this.script.concat('apt-get update');
      this.script = this.script.concat('apt-get install -y ' + packageList);
      this.options.restartApache = true;
    }
  }

  // a meta-script that runs all setup commands.
  addScriptSetup() {
    //this.addScriptHeader();
    this.addScriptCliDefines();
    this.addScriptInstallPackages();
  }

  addScriptBuildCommands() {
    var commands = this.options.buildCommands;
    if (!this.isEmptyObject(commands)) {
      var commandList = commands.join(' ');
      this.script = this.script.concat(commandList);
    }
  }

  isEmptyObject(o) {
    return !Object.keys(o).length;
  }


  sanitizeValue(val) {
    if (typeof val === 'string') {
      val = val.replace(/'/g, '\\\'');
      val = val.replace(/"/g, '\\\"');
      val = '\'' + val + '\'';
    }
    return val;
  }
}

module.exports = StaticApp;
