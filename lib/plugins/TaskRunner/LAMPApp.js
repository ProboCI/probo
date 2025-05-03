'use strict';

const Path = require('path');

var Script = require('./Script');

class LAMPApp extends Script {
  /**
   * Options (used by this task):
   *   @param {object} container - An instantiated and configured Container object.
   *   @param {object} options - A hash of configuration options specific to this task.
   *   @param {string} [options.database] - The file name of the database to import if specified. Note that this database *must be added to the assets array separately*.
   *   @param {string} [options.database] - The file name of the database to import if specified. Note that this database *must be added to the assets array separately*.
   *   @param {string} [options.databaseEngine] - The name of the database engine to use.  Must be either `mysql` or `pgsql`.  Defaults to `mysql`.
   *   @param {string} [options.databaseUser] - The username of the database to use.
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
   *   @param {boolean} [options.restartPostgresql] - Whether to restart PostgreSQL.
   */
  constructor(container, options) {
    super(container, options);

    this.databaseName = options.databaseName || 'lampdb';

    this.options.databasePrefix = options.databasePrefix || '';
    this.options.databaseEngine = options.databaseEngine || 'mysql';

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
    this.options.restartPostgresql = options.restartPostgres || false;

    // Determine which flavor of linux we are parsing.
    const containerSplit = container.image.split(":");
    const linuxSplit = containerSplit[0].split("/");
    this.options.linux = linuxSplit[1];

    // TODO: Add some kind of validation.

    // Filter out secret strings
    options.secrets = [this.databaseUser, this.databasePass];

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
    this.addScriptDatabase();
  }

  addScriptHeader() {
    this.script = this.script.concat([
      'READY=0; MYSQL_ALIVE=`mysqladmin ping`; while [ "$MYSQL_ALIVE" != "mysqld is alive" ] && [ $READY -lt 60 ]; do echo "Waiting for MySQL..."; service mysql start; READY=$((READY + 1)); sleep 1; MYSQL_ALIVE=`mysqladmin ping`; done; if [ "$MYSQL_ALIVE" != "mysqld is alive" ]; then echo "MySQL failed to start!"; exit 1; fi;',

      // Parse the php info to find where apache settings are stored. This is
      // different on different operating systems, but this should work on all
      // of them because it reads the loaded config.
      "PHPINI_PATH=\"$(php -i | grep php.ini | head -1 | sed 's/\\/cli//g' | sed 's/.* //g')\"",
    ]);
  }

  addScriptSymlinks() {
    this.script = this.script.concat([
      'rm -rf /var/www/html',
      'if [ -d "$SRC_DIR/' + this.subDirectory + '" ] ; then',
      "  echo 'Subdirectory " +
        this.subDirectory +
        " found within code directory, creating symlink.'",
      '  ln -s "$SRC_DIR/' + this.subDirectory + '" /var/www/html',
      'fi',
      'if [ -a "$SRC_DIR/index.php" ] ; then',
      "  echo 'Index.php found within the root of the codebase, creating symlink.'",
      '  ln -s $SRC_DIR  /var/www/html',
      'fi',
    ]);
  }

  addScriptCreateDatbase() {
    switch (this.options.databaseEngine) {
      case 'mysql':
        this.script = this.script.concat([
          'echo \'Creating MySQL Database, user and granting access.\'',
          'mysql -e \'create database ' + this.databaseName + '\'',
          'mysql -e \'grant all on ' + this.databaseName + '.* to "root"@"localhost"\'',
          'mysql -e \'flush privileges\'',
        ]);
        break;
      case 'pgsql':
        this.script = this.script.concat([
          'echo \'Creating PostgreSQL Database, user and granting access.\'',
          'sudo -u postgres createdb --encoding=UTF8 --owner=root --template=template0 ' + this.databaseName,
        ]);
        break;
    }
  }

  addScriptImportDatabase() {
    if (this.options.database) {
      this.script = this.script.concat(['echo "Importing database."']);
      let databaseImportBase = '';
      if (this.options.databaseGzipped) {
        databaseImportBase =
          'pv $ASSET_DIR/' + this.options.database + ' | gunzip -c |';
      } else if (this.options.databaseBzipped) {
        databaseImportBase =
          'bunzip2 -c | pv $ASSET_DIR/' + this.options.database + ' | ';
      } else {
        databaseImportBase = 'pv $ASSET_DIR/' + this.options.database + ' | ';
      }

      else if (this.options.databaseBzipped) {
        databaseImportBase = 'bunzip2 -c';
      }
      else {
        databaseImportBase = 'cat';
      }
      switch (this.options.databaseEngine) {
        case 'mysql':
          this.script.push(`${databaseImportBase} $ASSET_DIR/${this.options.database} | $(mysql -u ${constants.DATABASE_USER} --password=${constants.DATABASE_PASSWORD} ${this.databaseName});`);
          break;
        case 'pgsql':
          this.script.push(`sudo -u postgres ${databaseImportBase} $ASSET_DIR/${this.options.database} | $(psql ${this.databaseName});`);
          break;
      }
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
    this.addScriptApacheMods();
    this.addScriptPhpMods();
    this.addScriptRestartApache();
    this.addVarnishSetup();
  }

  // a meta-script that installs all mysql related scripts.
  addScriptDatabase() {
    switch (this.options.databaseEngine) {
      case 'mysql':
        this.addScriptMysqlCnfOptions();
        this.addScriptRestartMysql();
        break;
      case 'pgsql':
        this.addScriptRestartPostgresql();
        break;
    }
  }

  // a meta-script that runs all setup commands.
  addScriptSetup() {
    this.addScriptHeader();
    this.addScriptCliDefines();
    this.addScriptInstallPackages();
  }

  addScriptMysqlCnfOptions() {
    var options = this.options.mysqlCnfOptions;
    this.script = this.script.concat(
      'echo "!include /etc/mysql/probo-settings.cnf" >> /etc/mysql/my.cnf'
    );
    this.script = this.script.concat(
      'echo "[mysqld]" >> /etc/mysql/probo-settings.cnf'
    );
    if (!this.isEmptyObject(options)) {
      for (var key in options) {
        if (options.hasOwnProperty(key)) {
          var val = this.sanitizeValue(options[key]);
          this.script = this.script.concat(
            `echo "${key}=${val}" >> /etc/mysql/probo-settings.cnf`
          );
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
      this.script = this.script.concat(
        `echo "${phpText}" > $SRC_DIR/.proboPhpConstants.php`
      );
      this.options.phpIniOptions.all.auto_prepend_file =
        '$SRC_DIR/.proboPhpConstants.php';
      this.options.restartApache = true;
    }
  }


  // We will use the options.linux variable defined in the constructor to tell Probo
  // which way to put additional ini options. It will be either 'alpine' or 'ubuntu'
  // for the time being.
  addScriptPhpIniOptions() {
    let iniPath = false;
    if (this.options.linux == "alpine") {
      const pathsToCheck = ['/etc/php7', '/etc/php8', '/etc/php81', '/etc/php82'];
      for (let path in pathsToCheck) {
        iniPath = pathsToCheck[path] + '/conf.d';
        if (!this.isEmptyObject(this.options.phpIniOptions)) {
          let options = JSON.parse(JSON.stringify(this.options.phpIniOptions));
          this.options.restartApache = true;
          let newOptions = { ...options.all, ...options.apache2 };
          delete options.all;
          delete options.apache2;
          newOptions = { ...newOptions, ...options };
          for (let key in newOptions) {
            if (newOptions.hasOwnProperty(key)) {
              let val = this.sanitizeValue(newOptions[key]);
              this.script = this.script.concat(
                `if [ -d "${iniPath}" ]; then echo "${key}=${val}" >> ${iniPath}/99-probo-settings.ini; fi`
              );
            }
          }
        }
      }
    } else {
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
  }

  addPhpOptionsToPath(paths, options) {
    for (let pathKey in paths) {
      if (paths.hasOwnProperty(pathKey)) {
        for (let key in options) {
          if (options.hasOwnProperty(key)) {
            let val = this.sanitizeValue(options[key]);
            this.script = this.script.concat(
              `echo "${key}=${val}" >> $PHPINI_PATH/${paths[pathKey]}/conf.d/99-probo-settings.ini`
            );
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
      this.script = this.script.concat(
        mods.map(function (mod) {
          var enmod = 'php5enmod ' + mod;
          return enmod;
        })
      );
      this.options.restartApache = true;
    }
  }

  addScriptApacheMods() {
    var mods = this.options.apacheMods;
    if (!this.isEmptyObject(mods)) {
      this.script = this.script.concat(
        mods.map(function (mod) {
          var enmod = 'a2enmod ' + mod;
          return enmod;
        })
      );
      this.options.restartApache = true;
    }
  }

  addVarnishSetup() {
    var options = this.options.varnish;
    if (!this.isEmptyObject(options)) {
      if (
        options.hasOwnProperty('enable') &&
        this.sanitizeValue(options.enable) === true
      ) {
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
      this.script = this.script.concat([
        'export USER=`valid www-data`',
        'if [[ $USER = 1 ]]; then apache2ctl graceful; else apachectl graceful; fi',
      ]);
      // this.script = this.script.concat('apache2ctl graceful');
    }
  }

  addScriptRestartMysql() {
    if (this.options.restartMysql) {
      this.script = this.script.concat([
        'export USER=`valid www-data`',
        'if [[ $USER = 1 ]]; then service mysql restart; else mysqladmin refresh && mysqladmin reload; fi',
      ]);
    }
  }

  addScriptRestartPostgresql() {
    if (this.options.restartMysql) {
      this.script = this.script.concat('service postgresql restart');
    }
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

module.exports = LAMPApp;
