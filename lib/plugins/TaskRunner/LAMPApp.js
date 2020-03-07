'use strict';

var Script = require('./Script');

class LAMPApp extends Script {

  /**
   * Options (used by this task):
   *   @param {object} container - An instantiated and configured Container object.
   *   @param {object} options - A hash of configuration options specific to this task.
   *   @param {string} [options.database] - The file name of the database to import if specified. Note that this database *must be added to the assets array separately*.
   *   @param {string} [options.databaseName] - The name of the database to use. Defaults to 'lampdb'.
   *   @param {string} [options.databaseUser] - The username of the database to use. Defaults to 'root'.
   *   @param {string} [options.databasePass] - The password for the database username. Defaults to 'strongpassword'.
   *     - Note not recommended to pass credentials in options.
   *       Instead, include a credentials.sh assets file https://docs.probo.ci/build/assets/ which contains e.g.:
   *          #!bin/bash
   *          DATABASE_NAME='foo'
   *          DATABASE_USER='bar'
   *          DATABASE_PASS='baz'
   *   @param {boolean} [options.databaseGzipped] - Whether the database was sent gzipped and whether it should therefore be gunzipped before importing.
   *   @param {boolean} [options.databaseBzipped] - Whether the database was sent bzipped and whether it should therefore be bunzipped before importing.
   *   @param {string} [options.subDirectory] - The directory of the actual web root (defaults to 'docroot').
   *   @param {hash} [options.cliDefines] - A hash of defines, such as {define1: 'define1Value', define2: 'define2Value',}
   *   @param {hash} [options.phpIniOptions] - A hash of options for all, apache2, and cli e.g. {all: {option1: 'option1Value', option2: 'option2Value'}}
   *   @param {hash} [options.mysqlCnfOptions] - A hash of options, such as {option1: 'option1Value', option2: 'option2Value',}
   *   @param {hash} [options.phpConstants] - A hash of constants, such as {const1: 'const1Value', const2: 'const2Value',}.
   *      This will overwrite any other auto_prepend_file directives in your php.ini.
   *   @param {array} [options.installPackages] - An array of additional packages to install.
   *   @param {array} [options.phpMods] - An array of php5 modules to enable (should be installed via installPackages if needed)
   *   @param {array} [options.apacheMods] - An array of apache modules to enable (should be installed via installPackages if needed)
   *   @param {boolean} [options.restartApache] - Whether to restart Apache. If phpIniOptions, phpConstants, phpMods, or apacheMods
   *      are set, Apache will be restarted automatically, so you probably won't need to use this.
   *   @param {hash} [options.varnish] - A has of options to indicate whether to use varnish http cache or not.
   *      Options are {'enabled' (boolean, defaults to false) and 'pathToVcl' (string)}.
   *   @param {boolean} [options.restartMysql] - Whether to restart MySQL. If mysqlCnfOptions is set, MySQL will be restarted automatically,
   *      so you probably won't need to use this.
   *   @param {boolean} [options.phpVersion] - The version of PHP to be used on this build. Limited to php5.6, php7.0, php7.1, php7.2 and php7.3
   */

  constructor(container, options) {

    super(container, options);

    this.databaseName = options.databaseName || 'lampdb';
    this.databaseUser = options.databaseUser || 'root';
    this.databasePass = options.databasePass || 'strongpassword';
    this.options.cliDefines = options.cliDefines || {};
    this.options.mysqlCnfOptions = options.mysqlCnfOptions || {};
    this.options.phpIniOptions = options.phpIniOptions || {};
    this.options.phpIniOptions.all = options.phpIniOptions.all || {};
    this.options.phpConstants = options.phpConstants || {};
    this.options.installPackages = options.installPackages || {};
    this.options.phpMods = options.phpMods || {};
    this.options.apacheMods = options.apacheMods || {};
    this.options.restartApache = options.restartApache || false;
    this.options.varnish = options.varnish || {};
    this.options.restartMysql = options.restartMysql || false;
    this.options.phpVersion = options.phpVersion || 'php7.2';

    // TODO: Add some kind of validation.

    // Filter out secret strings
    options.secrets = [
      this.databaseUser,
      this.databasePass,
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
    this.addScriptCreateDatabase();
    if (this.options.database) {
      this.addScriptImportDatabase();
    }
    this.addScriptApachePhp();
    this.addScriptMysql();
  }

  addScriptHeader() {
    this.script = this.script.concat([
      'READY=0; while ! `nc -z 127.0.0.1 3306` && [ $READY -lt 60 ]; do echo "Waiting for MySQL..."; READY=$((READY + 1)); sleep 1; done; if `nc -z 127.0.0.1 3306`; then echo "MySQL is ready."; else echo "MySQL failed to start!"; exit 1; fi;',

      // Parse the php info to find where apache settings are stored. This is
      // different on different operating systems, but this should work on all
      // of them because it reads the loaded config.
      'PHPINI_PATH="$(php -i | grep php.ini | head -1 | sed \'s/\\/cli//g\' | sed \'s/.* //g\')"',
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

  addScriptCreateDatabase() {
    this.script = this.script.concat([
      'echo \'Creating MySQL Database, user and granting access.\'',
      'DATABASE_NAME=' + this.databaseName,
      'DATABASE_USER=' + this.databaseUser,
      'DATABASE_PASS=' + this.databasePass,
      // Set db credentials if found.
      'if [ -e $ASSET_DIR/credentials.sh ]; then source $ASSET_DIR/credentials.sh; fi',
      'mysql -e \'create database \'$DATABASE_NAME',
      'if [ "$DATABASE_USER" != "root" ]; then mysql -e \'create user "\'$DATABASE_USER\'"@"localhost" identified by "\'$DATABASE_PASS\'"\'; fi',
      'mysql -e \'grant all on \'$DATABASE_NAME\'.* to "\'$DATABASE_USER\'"@"localhost"\'',
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
      this.script = this.script.concat([
        'echo "Importing database."',
      ]);
      this.script.push(`${databaseImportBase} $ASSET_DIR/${this.options.database} | $(mysql -u $DATABASE_USER --password=$DATABASE_PASS $DATABASE_NAME);`);
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

  // a meta-script that installs all apache/php related scripts.
  addScriptApachePhp() {
    this.addScriptPhpConstants();
    this.addScriptPhpIniOptions();
    this.addScriptPhpVersion();
    this.addScriptApacheMods();
    this.addScriptPhpMods();
    this.addScriptRestartApache();
    this.addVarnishSetup();
  }

  // a meta-script that installs all mysql related scripts.
  addScriptMysql() {
    this.addScriptMysqlCnfOptions();
    this.addScriptRestartMysql();
  }


  // a meta-script that runs all setup commands.
  addScriptSetup() {
    this.addScriptHeader();
    this.addScriptCliDefines();
    this.addScriptInstallPackages();
  }

  addScriptMysqlCnfOptions() {
    var options = this.options.mysqlCnfOptions;
    this.script = this.script.concat('echo "!include /etc/mysql/probo-settings.cnf" >> /etc/mysql/my.cnf');
    this.script = this.script.concat('echo "[mysqld]" >> /etc/mysql/probo-settings.cnf');
    if (!this.isEmptyObject(options)) {
      for (var key in options) {
        if (options.hasOwnProperty(key)) {
          var val = this.sanitizeValue(options[key]);
          this.script = this.script.concat(`echo "${key}=${val}" >> /etc/mysql/probo-settings.cnf`);
        }
      }
    }
    this.options.restartMysql = true;
  }

  addScriptPhpConstants() {
    var consts = this.options.phpConstants;
    var phpText = '<?php ';
    if (!this.isEmptyObject(consts)) {
      for (var key in consts) {
        if (consts.hasOwnProperty(key)) {
          var val = this.sanitizeValue(consts[key]);
          phpText = phpText + `define ('${key}', ${val}); `;
        }
      }
      this.script = this.script.concat(`echo "${phpText}" > $SRC_DIR/.proboPhpConstants.php`);
      this.options.phpIniOptions.all.auto_prepend_file = '$SRC_DIR/.proboPhpConstants.php';
      this.options.restartApache = true;
    }
  }

  addScriptPhpIniOptions() {
    if (!this.isEmptyObject(this.options.phpIniOptions)) {
      // We clone the object because we modify it
      // and will mess things up if this is run
      // multiple times.
      let options = JSON.parse(JSON.stringify(this.options.phpIniOptions));
      let paths = {
        all: ['apache2', 'cli'],
        apache2: ['apache2'],
        cli: ['cli'],
      };
      for (let key in paths) {
        if (paths.hasOwnProperty(key)) {
          let path = paths[key];
          if (options[key] && !this.isEmptyObject(options[key])) {
            this.addPhpOptionsToPath(path, options[key]);
            if (key !== 'cli') {
              this.options.restartApache = true;
            }
          }
          delete options[key];
        }
      }
      // Support legacy use of options not within 'all', 'apache2', or 'cli'.
      if (!this.isEmptyObject(options)) {
        this.addPhpOptionsToPath(paths.all, options);
        this.options.restartApache = true;
      }
    }
  }

  // https://www.tecmint.com/install-different-php-versions-in-ubuntu/
  // Support for multiple versions of PHP available on the same ProboCI Instance.
  // Requires an Ubuntu image for these commands to work until a practical, generic
  // version is available.
  addScriptPhpVersion() {
    if (this.options.phpVersion) {
      // Check for valid php version being set in our .probo.yaml file or go to default.
      var validPHP = false;
      var acceptableVersions = ["php5.6", "php7.0", "php7.1", "php7.2", "php7.3"];
      var index = 0;
      while (index < acceptableVersions.length) {
        if (this.options.phpVersion == acceptableVersions[index]) {
          validPHP = true;
        }
        index++;
      }

      // If no valid version, use default (currently php7.2)
      if (validPHP == false) {
        this.options.phpVersion = 'php7.2';
      }

      if (this.options.phpVersion != 'php7.2') {
        this.script = this.script.concat(`update-alternatives --set php /usr/bin/${this.options.phpVersion} --quiet`);
        this.script = this.script.concat('a2dismod php7.2');
        this.script = this.script.concat(`a2enmod ${this.options.phpVersion}`);
        this.options.restartApache = true;
      }
    }
  }

  addPhpOptionsToPath(paths, options) {
    for (let pathKey in paths) {
      if (paths.hasOwnProperty(pathKey)) {
        for (let key in options) {
          if (options.hasOwnProperty(key)) {
            let val = this.sanitizeValue(options[key]);
            this.script = this.script.concat(`echo "${key}=${val}" >> $PHPINI_PATH/${paths[pathKey]}/conf.d/99-probo-settings.ini`);
          }
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

  addVarnishSetup() {
    var options = this.options.varnish;
    if (!this.isEmptyObject(options)) {
      if (options.hasOwnProperty('enable') && this.sanitizeValue(options.enable) === true) {
        if (options.hasOwnProperty('pathToVcl')) {
          let path = this.sanitizeValue(options.pathToVcl);
          this.script.push('cp ' + path + ' /etc/varnish/default.vcl');
        }
        this.script.push('a2enconf listen_8080');
        this.script.push('a2dissite 000-default.conf');
        this.script.push('a2ensite 000-default-varnish.conf');
        this.script.push('service varnish reload');
        this.options.restartApache = true;
      }
    }
  }

  addScriptRestartApache() {
    if (this.options.restartApache) {
      this.script = this.script.concat('apache2ctl graceful');
    }
  }

  addScriptRestartMysql() {
    if (this.options.restartMysql) {
      this.script = this.script.concat('service mysql restart');
    }
  }

  isEmptyObject(o) {
    return !Object.keys(o).length;
  }


  sanitizeValue(val) {
    if (typeof val === 'string') {
      val = val.replace(/'/g, '\\\'');
      val = val.replace(/"/g, '\\"');
      val = '\'' + val + '\'';
    }
    return val;
  }
}

module.exports = LAMPApp;
