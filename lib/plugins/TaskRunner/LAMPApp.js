'use strict';

var Script = require('./Script');
var constants = require('./constants');


class LAMPApp extends Script {


  /**
   * Options (used by this task):
   *   @param {object} container - An instantiated and configured Container object.
   *   @param {object} options - A hash of configuration options specific to this task.
   *   @param {string} [options.database] - The file name of the database to import if specified. Note that this database *must be added to the assets array separately*.
   *   @param {string} [options.databaseName] - The name of the database to use.
   *   @param {string} [options.databaseUser] - The username of the database to use.
   *   @param {boolean} [options.databaseGzipped] - Whether the database was sent gzipped and whether it should therefore be gunzipped before importing.
   *   @param {boolean} [options.databaseBzipped] - Whether the database was sent bzipped and whether it should therefore be bunzipped before importing.
   *   @param {string} [options.subDirectory] - The directory of the actual web root (defaults to 'docroot').
   *   @param {hash} [options.cliDefines] - A hash of defines, such as {define1: 'define1Value', define2: 'define2Value',}
   *   @param {hash} [options.phpIniOptions] - A hash of options, such as {option1: 'option1Value', option2: 'option2Value',}
   *   @param {hash} [options.phpConstants] - A hash of constants, such as {const1: 'const1Value', const2: 'const2Value',}.
   *      This will overwrite any other auto_prepend_file directives in your php.ini.
   *   @param {array} [options.installPackages] - An array of additional packages to install.
   *   @param {array} [options.phpMods] - An array of php5 modules to enable (should be installed via installPackages if needed)
   *   @param {array} [options.apacheMods] - An array of apache modules to enable (should be installed via installPackages if needed)
   *   @param {boolean} [options.restartApache] - Whether to restart Apache. If phpIniOptions, phpConstants, phpMods, or apacheMods
   *      are set, Apache will be restarted automatically, so you probably won't need to use this.
   */
  constructor(container, options) {

    super(container, options);

    this.databaseUser = options.databaseUser || 'lampdb';
    this.databaseName = options.databaseName || 'lampdb';
    this.options.cliDefines = options.cliDefines || {};
    this.options.phpIniOptions = options.phpIniOptions || {};
    this.options.phpConstants = options.phpConstants || {};
    this.options.installPackages = options.installPackages || {};
    this.options.phpMods = options.phpMods || {};
    this.options.apacheMods = options.apacheMods || {};
    this.options.restartApache = options.restartApache || false;

    // TODO: Add some kind of validation.

    // Filter out secret strings
    options.secrets = [
    ];

    // Allow for subdirectory to be explicitly set to "" without being overwritten for being falsy.
    this.subDirectory = options.subDirectory || 'docroot';
    this.script = [];
    this.populateScriptArray();
    this.setScript(this.script);
  }

  description() {
    return `${this.plugin} 'Provisioning LAMP Application!'`;
  }

  /**
   *
   */
  populateScriptArray() {
    this.addScriptSetup();
    this.addScriptSymlinks();
    this.addScriptCreateDatbase();
    if (this.options.database) {
      this.addScriptImportDatabase();
    }
    this.addScriptApachePhp();
  }

  addScriptHeader() {
    this.script = this.script.concat([
      'READY=0; while ! `nc -z 127.0.0.1 3306` && [ $READY -lt 60 ]; do echo "Waiting for MySQL..."; READY=$((READY + 1)); sleep 1; done; if `nc -z 127.0.0.1 3306`; then echo "MySQL is ready."; else echo "MySQL failed to start!"; exit 1; fi;',
    ]);
  }

  addScriptSymlinks() {
    this.script = this.script.concat([
      'if [ -d "$SRC_DIR/' + this.subDirectory + '" ] ; then',
      '  echo \'Subdirectory ' + this.subDirectory + ' found within code directory, creating symlink.\'',
      '  ln -s "$SRC_DIR/' + this.subDirectory + '" /var/www/html',
      'fi',
      'if [ -a "$SRC_DIR/index.php" ] ; then',
      '  echo \'Index.php found within the root of the codebase, creating symlink.\'',
      '  ln -s $SRC_DIR  /var/www/html',
      'fi',
    ]);
  }

  addScriptCreateDatbase() {
    this.script = this.script.concat([
      'echo \'Creating MySQL Database, user and granting access.\'',
      'mysql -e \'create database ' + this.databaseName + '\'',
      'mysql -e \'grant all on ' + this.databaseName + '.* to "root"@"localhost"\'',
      'mysql -e \'flush privileges\'',
    ]);
  }

  addScriptImportDatabase() {
    if (this.options.database) {
      var databaseImportBase = '';
      if (this.options.databaseGzipped) {
        databaseImportBase = 'gunzip -c';
      }
      else if (this.options.databaseBzipped) {
        databaseImportBase = 'bunzip2 -c';
      }
      else {
        databaseImportBase = 'cat';
      }
      this.script.push(`${databaseImportBase} $ASSET_DIR/${this.options.database} | $(mysql -u ${constants.DATABASE_USER} --password=${constants.DATABASE_PASSWORD} ${this.databaseName});`);
      this.script.push(`rm $ASSET_DIR/${this.options.database};`);
    }
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

  // a meta-script that installs all apache/php-related scripts
  addScriptApachePhp() {
    this.addScriptPhpConstants();
    this.addScriptPhpIniOptions();
    this.addScriptApacheMods();
    this.addScriptPhpMods();
    this.addScriptRestartApache();
  }

  // a meta-script that runs all setup commands
  addScriptSetup() {
    this.addScriptHeader();
    this.addScriptCliDefines();
    this.addScriptInstallPackages();
  }

  addScriptPhpConstants() {
    var consts = this.options.phpConstants;
    var phpText = '<?php ';
    if (!this.isEmptyObject(consts)) {
      for (var key in consts) {
        if (consts.hasOwnProperty(key)) {
          var val = this.sanitizeValue(consts[key]);
          phpText = phpText + `define ('${key}', ${val}); `;
          this.script = this.script.concat(`cat /etc/php5/apache2/php.ini << EOL >> ${key}=${val}`);
        }
      }
      this.script = this.script.concat(`echo "${phpText}" > $(SRC_DIR).proboPhpConstants.php`);
      this.options.phpIniOptions.auto_prepend_file = '.proboPhpConstants.php';
      this.options.restartApache = true;
    }
  }

  addScriptPhpIniOptions() {
    var options = this.options.phpIniOptions;
    if (!this.isEmptyObject(options)) {
      for (var key in options) {
        if (options.hasOwnProperty(key)) {
          var val = this.sanitizeValue(options[key]);
          this.script = this.script.concat(`cat /etc/php5/apache2/php.ini << EOL >> ${key}=${val}`);
        }
      }
      this.options.restartApache = true;
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

  addScriptPhpMods() {
    var mods = this.options.phpMods;
    if (!this.isEmptyObject(mods)) {
      this.script = this.script.concat(mods.map(function(mod) {
        var enmod = 'php5enmod ' + mod;
        return enmod;
      }));
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

module.exports = LAMPApp;
