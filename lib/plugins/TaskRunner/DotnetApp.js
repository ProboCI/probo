'use strict';

var Script = require('./Script');
var constants = require('./constants');


class DotnetApp extends Script {


  /**
   * Options (used by this task):
   *   @param {object} container - An instantiated and configured Container object.
   *   @param {object} options - A hash of configuration options specific to this task.
   *   @param {string} [options.dllName] - The name of the DLL to use.
   *   @param {array} [options.installPackages] - An array of additional packages to install.
   *   @param {array} [options.apacheMods] - An array of apache modules to enable (should be installed via installPackages if needed)
   *   @param {boolean} [options.restartApache] - Whether to restart Apache. If phpIniOptions, phpConstants, phpMods, or apacheMods
   *      are set, Apache will be restarted automatically, so you probably won't need to use this.
   */
  constructor(container, options) {

    super(container, options);

    this.options.installPackages = options.installPackages || {};
    this.options.apacheMods = options.apacheMods || {};
    this.options.restartApache = options.restartApache || false;
    this.options.dllName = options.dllName;

    // TODO: Add some kind of validation.

    // Filter out secret strings
    options.secrets = [
    ];

    // Allow for subdirectory to be explicitly set to "" without being overwritten for being falsy.
    this.script = [];
    this.addScriptApacheDotnet();
    this.setScript(this.script);
  }

  description() {
    return `${this.plugin} 'Provisioning Dotnet Core Application!'`;
  }

  // a meta-script that installs all apache/dotnet-related scripts
  addScriptApacheDotnet() {
    this.addScriptDotnetCoreInit();
    this.addScriptInstallPackages();
    this.addScriptApacheMods();
    this.addScriptRestartApache();
  }

  addScriptDotnetCoreInit() {
    this.script = this.script.concat('mkdir -p /var/webapp');
    this.script = this.script.concat('mkdir -p /var/www/html');
    this.script = this.script.concat('cd $SRC_DIR && dotnet restore');
    this.script = this.script.concat('cd $SRC_DIR && dotnet publish -c Release -o /var/webapp');
    this.script = this.script.concat('a2dissite 000-default');
    this.script = this.script.concat('a2ensite 000-default-dotnet');
    this.script = this.script.concat('a2enconf listen_8080');
    this.script = this.script.concat('chown -R www-data:www-data /var/webapp');
    this.script = this.script.concat('service apache2 reload');
    this.script = this.script.concat('cd $SRC_DIR && dotnet run --configuration Release');
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

  addScriptApacheMods() {
    var mods = this.options.apacheMods;
    if (!this.isEmptyObject(mods)) {
      this.script = this.script.concat(mods.map(function(mod) {
        var enmod = 'a2enmod ' + mod;
        return enmod;
      }));
      this.options.restartApache = true;
    }
  }

  addScriptRestartApache() {
    if (this.options.restartApache) {
      this.script = this.script.concat('apache2ctl graceful');
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

module.exports = DotnetApp;
