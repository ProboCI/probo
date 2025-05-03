'use strict';
var shellEscape = require('shell-escape');
var crypto = require('crypto');

var constants = require('./constants');

var LAMPApp = require('./LAMPApp');

class Drupal extends LAMPApp {
  /**
   * Options (used by this task in addition to the LAMPApp options):
   *   @param {object} container - An instantiated and configured Container object.
   *   @param {object} options - A hash of configuration options specific to this task.
   *   @param {boolean} options.clearCaches - Whether to clear all caches after the build is finished. Defaults to true.
   *   @param {string} options.siteFolder - The site folder to use for this build (the folder within the drupal `sites` folder).  Defaults to `default`.
   *   @param {string} options.database - The name of the database to import if specified. Note that this database *must be added to the assets array separately*.
   *   @param {boolean} options.databaseClean - Do we run our database sanitize script that clears out revisions and watchdog and search tables.
   *   @param {boolean} options.databaseGzipped - Whether the database was sent gzipped and whether it should therefore be gunzipped before importing.
   *   @param {boolean} options.databaseBzipped - Whether the database was sent bzipped and whether it should therefore be bunzipped before importing.
   *   @param {boolean} options.databasePrefix - A prefix for the database.
   *   @param {boolean} options.databaseUpdates - Determines whether to run `drush updb`.
   *   @param {boolean} options.revertFeatures - Whether to revert features using `drush fra`.
   *   @param {integer} options.drupalVersion - The version of Drupal being used. If set, alters the behavior of certain options, such as clearCaches.
   *   @param {string} options.makeFile - The name of the make file to run to generate the install directory.
   *   @param {boolean} options.makeForceComplete - Whether to use the `--force-complete` option for drush make.  Defaults to true.
   *   @param {array} [options.makeArgs] - An array of additional params to concat onto the drush `make` command.
   *   @param {boolean} options.runInstall - If set, run `drush site-install` to perform a fresh install of the site using the profileName as the profile to install and allowing instlallArgs to configure the install.
   *   @param {string} options.profileName - The profileName, used in symlinking this directory if makeFile is specified and used to select the profile to install if `runInstall` is selected.
   *   @param {string} options.installArgs - A set of params to concat onto the drush `site-install` command (defaults to '').
   *   @param {string} options.subDirectory - The directory of the actual web root (defaults to 'docroot').
   *   @param {string} options.configSyncDirectory - The config sync directory used in Drupal 8.
   *   @param {string} [options.settingsAppend] - A snippet to append to the end of the settings.php file.
   *   @param {string} [options.settingsRequireFile] - A file to require at the end of settings.php (in order to get around not
   *   @param {string} [options.fileProxy] - If a file doesn't exist in the repository, the file can be retrieved from the production instance of the site. Enter the protocol and fully qualified domain here, as in "https://example.com".
   *      checking settings.php into your repo).
   *   @augments LAMPApp
   */
  constructor(container, options) {
    super(container, options);

    this.databaseName = this.options.databaseName || 'drupal';
    this.options.databaseClean = this.options.databaseClean || false;
    this.options.databasePrefix = this.options.databasePrefix || '';
    this.options.siteFolder = options.siteFolder || 'default';
    this.options.profileName = options.profileName || 'standard';
    this.options.clearCaches =
      options.clearCaches || typeof options.clearCaches === 'undefined';
    this.options.databaseUpdates =
      options.databaseUpdates || typeof options.databaseUpdates === 'undefined';
    this.options.drupalVersion =
      options.drupalVersion || constants.DEFAULT_DRUPAL_VERSION;
    this.options.makeForceComplete =
      options.makeForceComplete ||
      typeof options.makeForceComplete === 'undefined';

    // TODO: Add some kind of validation.
    // Filter out secret strings
    options.secrets = [];

    // Allow for subdirectory to be explicitly set to "" without being overwritten for being falsy.
    this.subDirectory = options.subDirectory || 'docroot';
    this.script = [];
    if (this.drupalVersionSupported()) {
      this.populateScriptArray();
    } else {
      // I'd like to throw an error instead of adding this message but then the
      // build hands with no feedback.
      this.addScriptUnsupportedDrupalVersion();
    }
    this.setScript(this.script);
  }

  description() {
    return `${this.plugin} 'Provisioning Drupal!'`;
  }

  populateScriptArray() {
    this.addScriptSetup();
    this.addScriptSetupDrush();
    if (this.options.makeFile) {
      this.addScriptRunMakeFile();
    } else {
      this.addScriptSymlinks();
    }
    this.addScriptApachePhp();
    this.addScriptDatabase();
    this.addScriptCreateDatabase();
    this.addScriptAppendSettingsPHPSettings();
    this.addScriptPublicFilesDirectory();
    if (this.options.database) {
      this.addScriptImportDatabase();
      if (this.options.databaseClean) {
        this.addScriptSanitizeDatabase();
      }
    }
    // if (this.options.drupalVersion >= 8 && this.options.database) {
    //   this.addScriptClearCaches();
    // }
    if (this.options.runInstall) {
      this.addScriptRunInstall();
    }
    if (this.options.databaseUpdates) {
      this.addScriptDatabaseUpdates();
    }
    if (this.options.revertFeatures) {
      this.addScriptRevertFeatures();
    }
    if (this.options.fileProxy) {
      this.addScriptFileProxy();
    }
    if (this.options.varnish) {
      this.addVarnishDrupalVcl();
    }
    if (this.options.clearCaches) {
      this.addScriptClearCaches();
    }
  }

  addScriptSetupDrush() {
    if (this.options.drupalVersion === 7) {
      this.script.push(
        'ln -s /usr/local/src/drush8/vendor/bin/drush /usr/local/bin/drush'
      );
    } else if (this.options.drupalVersion === 8) {
      //this.script.push(
      //  'ln -s /usr/local/src/drush9/vendor/bin/drush /usr/local/bin/drush'
      //);
    } else if (this.options.drupalVersion === 9) {
      //this.script.push(
      //  'ln -s /usr/local/src/drush-launcher/drush /usr/local/bin/drush'
      //);
    } else if (this.options.drupalVersion === 10) {
      //this.script.push(
      //  'ln -s /usr/local/src/drush-launcher/drush /usr/local/bin/drush'
      //);
    }
  }

  addScriptAppendSettingsPHPSettings() {
    if (this.options.drupalVersion === 7) {
      this.addD7PHPSettings();
    } else if (this.options.drupalVersion === 8) {
      this.addD8PHPSettings();
    } else if (this.options.drupalVersion === 9) {
      this.addD9PHPSettings();
    } else if (this.options.drupalVersion === 10) {
      this.addD10PHPSettings();
    } else if (this.options.drupalVersion === 11) {
      this.addD11PHPSettings();
    }
    this.appendCustomSettings();
  }

  addD7PHPSettings() {
    this.script = this.script.concat([
      'PHP_SNIPPET=$(cat <<END_HEREDOC',
      '\\$databases = array(',
      "  'default' => array(",
      "    'default' => array(",
      "      'database' => '$DATABASE_NAME',",
      "      'username' => '$DATABASE_USER',",
      "      'password' => '$DATABASE_PASS',",
      `      'prefix' => '${this.options.databasePrefix}',`,
      `      'host' => 'localhost',`,
      `      'driver' => 'mysql',`,
      `    ),`,
      `  ),`,
      `);`,
      `END_HEREDOC`,
      `)`,
      `if [ ! -e "/var/www/html/sites/${this.options.siteFolder}/settings.php" ] ; then`,
      `  echo '<?php\n' > /var/www/html/sites/${this.options.siteFolder}/settings.php`,
      'fi',
      `echo "$PHP_SNIPPET" >> /var/www/html/sites/${this.options.siteFolder}/settings.php`,
    ]);
  }

  addD8PHPSettings() {
    const hash = crypto.createHash('sha256');
    hash.update(crypto.randomBytes(40));
    const random = hash
      .digest('base64')
      .toString()
      .replace(/[^a-zA-Z0-9]/gi, '');
    const configSyncDirectory =
      this.options.configSyncDirectory ||
      `sites/default/files/config_${random}/sync`;
    this.script = this.script.concat([
      'PHP_SNIPPET=$(cat <<END_HEREDOC',
      '\\$databases = array(',
      "  'default' => array(",
      "    'default' => array(",
      "      'database' => '$DATABASE_NAME',",
      "      'username' => '$DATABASE_USER',",
      "      'password' => '$DATABASE_PASS',",
      `      'prefix' => '${this.options.databasePrefix}',`,
      "      'host' => 'localhost',",
      "      'driver' => 'mysql',",
      "      'port' => '3306',",
      // This is pretty gross. We should find a better way to handle this.
      "      'namespace' => 'Drupal\\\\\\\\Core\\\\\\\\Database\\\\\\\\Driver\\\\\\\\mysql',",
      "      'driver' => 'mysql',",
      '    ),',
      '  ),',
      ');',
      `\\$settings['hash_salt'] = '${random}';`,
      `\\$config_directories['sync'] = '${configSyncDirectory}';`,
      `\\$settings['trusted_host_patterns'] = ['.*'];`,
      `END_HEREDOC`,
      `)`,
      `if [ ! -e "/var/www/html/sites/${this.options.siteFolder}/settings.php" ] ; then`,
      `  echo '<?php\n' > /var/www/html/sites/${this.options.siteFolder}/settings.php`,
      'fi',
      `echo "$PHP_SNIPPET" >> /var/www/html/sites/${this.options.siteFolder}/settings.php`,
    ]);
  }

  addD9PHPSettings() {
    const hash = crypto.createHash('sha256');
    hash.update(crypto.randomBytes(40));
    const random = hash
      .digest('base64')
      .toString()
      .replace(/[^a-zA-Z0-9]/gi, '');
    const configSyncDirectory =
      this.options.configSyncDirectory ||
      `sites/default/files/config_${random}/sync`;
    this.script = this.script.concat([
      `PHP_SNIPPET=$(cat <<END_HEREDOC`,
      `\\$databases = array(`,
      `  'default' => array(`,
      `    'default' => array(`,
      `      'database' => '$DATABASE_NAME',`,
      `      'username' => '$DATABASE_USER',`,
      `      'password' => '$DATABASE_PASS',`,
      `      'prefix' => '${this.options.databasePrefix}',`,
      `      'host' => 'localhost',`,
      `      'driver' => '${this.options.databaseEngine}',`,
      `    ),`,
      `  ),`,
      `);`,
      `\\$settings['hash_salt'] = '${random}';`,
      `\\$settings['config_sync_directory'] = '${configSyncDirectory}';`,
      `\\$settings['trusted_host_patterns'] = ['.*'];`,
      `END_HEREDOC`,
      `)`,
      `if [ ! -e "/var/www/html/sites/${this.options.siteFolder}/settings.php" ] ; then`,
      `  echo '<?php\n' > /var/www/html/sites/${this.options.siteFolder}/settings.php`,
      `fi`,
      `echo "$PHP_SNIPPET" >> /var/www/html/sites/${this.options.siteFolder}/settings.php`,
    ]);
  }

  addD10PHPSettings() {
    const hash = crypto.createHash('sha256');
    hash.update(crypto.randomBytes(40));
    const random = hash
      .digest('base64')
      .toString()
      .replace(/[^a-zA-Z0-9]/gi, '');
    const configSyncDirectory =
      this.options.configSyncDirectory ||
      `sites/default/files/config_${random}/sync`;
    this.script = this.script.concat([
      `PHP_SNIPPET=$(cat <<END_HEREDOC`,
      `\\$databases = array(`,
      `  'default' => array(`,
      `    'default' => array(`,
      `      'database' => '$DATABASE_NAME',`,
      `      'username' => '$DATABASE_USER',`,
      `      'password' => '$DATABASE_PASS',`,
      `      'prefix' => '${this.options.databasePrefix}',`,
      `      'host' => 'localhost',`,
      `      'driver' => '${this.options.databaseEngine}',`,
      `      'port' => '3306',`,
      // This is pretty gross. We should find a better way to handle this.
      `      'namespace' => 'Drupal\\\\\\\\Core\\\\\\\\Database\\\\\\\\Driver\\\\\\\\${this.options.databaseEngine}',`,
      `    ),`,
      `  ),`,
      `);`,
      `\\$settings['hash_salt'] = '${random}';`,
      `\\$settings['config_sync_directory'] = '${configSyncDirectory}';`,
      `\\$settings['trusted_host_patterns'] = ['.*'];`,
      `END_HEREDOC`,
      `)`,
      `if [ ! -e "/var/www/html/sites/${this.options.siteFolder}/settings.php" ] ; then`,
      `  echo '<?php\n' > /var/www/html/sites/${this.options.siteFolder}/settings.php`,
      `fi`,
      `echo "$PHP_SNIPPET" >> /var/www/html/sites/${this.options.siteFolder}/settings.php`,
    ]);
  }

  addD11PHPSettings() {
    const hash = crypto.createHash('sha256');
    hash.update(crypto.randomBytes(40));
    const random = hash
      .digest('base64')
      .toString()
      .replace(/[^a-zA-Z0-9]/gi, '');
    const configSyncDirectory =
      this.options.configSyncDirectory ||
      `sites/default/files/config_${random}/sync`;
    this.script = this.script.concat([
      `PHP_SNIPPET=$(cat <<END_HEREDOC`,
      `\\$databases = array(`,
      `  'default' => array(`,
      `    'default' => array(`,
      `      'database' => '$DATABASE_NAME',`,
      `      'username' => '$DATABASE_USER',`,
      `      'password' => '$DATABASE_PASS',`,
      `      'prefix' => '${this.options.databasePrefix}',`,
      `      'host' => 'localhost',`,
      `      'driver' => 'mysql',`,
      `      'port' => '3306',`,
      `      'isolation_level' => 'READ COMMITTED',`,
      // This is pretty gross. We should find a better way to handle this.
      `      'namespace' => 'Drupal\\\\\\\\mysql\\\\\\\\Driver\\\\\\\\Database\\\\\\\\mysql',`,
      `      'driver' => 'mysql',`,
      `      'autoload' => 'core/modules/mysql/src/Driver/Database/mysql/'`,
      `    ),`,
      `  ),`,
      `);`,
      `\\$settings['hash_salt'] = '${random}';`,
      `\\$settings['config_sync_directory'] = '${configSyncDirectory}';`,
      `\\$settings['trusted_host_patterns'] = ['.*'];`,
      `END_HEREDOC`,
      `)`,
      `if [ ! -e "/var/www/html/sites/${this.options.siteFolder}/settings.php" ] ; then`,
      `  echo '<?php\n' > /var/www/html/sites/${this.options.siteFolder}/settings.php`,
      `fi`,
      `echo "$PHP_SNIPPET" >> /var/www/html/sites/${this.options.siteFolder}/settings.php`,
    ]);
  }

  appendCustomSettings() {
    if (this.options.settingsRequireFile) {
      let command =
        'echo "require_once(\'' +
        this.options.settingsRequireFile +
        '\');" >> /var/www/html/sites/' +
        this.options.siteFolder +
        '/settings.php';
      this.script.push(command);
    }
    if (this.options.settingsAppend) {
      let command =
        'echo ' +
        shellEscape([this.options.settingsAppend]) +
        ' >> /var/www/html/sites/' +
        this.options.siteFolder +
        '/settings.php';
      this.script.push(command);
    }
  }

  addScriptPublicFilesDirectory() {
    this.script = this.script.concat([
      'mkdir -p /var/www/html/sites/' + this.options.siteFolder + '/files',
      'export USER=`valid www-data`',
      '[[ $USER = 1 ]] && USER="www-data" || USER="apache"',
      'chown $USER:$USER -R /var/www/html/sites/' +
        this.options.siteFolder +
        '/files',
    ]);
  }

  addScriptRunInstall() {
    var installArgs = this.options.installArgs || '';
    this.script.push(
      `drush -y site-install --root=/var/www/html ${this.options.profileName} ${installArgs}`
    );
  }

  addScriptDatabaseUpdates() {
    this.script.push('drush -y --root=/var/www/html updb');
  }

  addScriptSanitizeDatabase() {
    this.script.push('drush -y --root=/var/www/html cr');
    this.script.push('drush -y --root=/var/www/html scr database_sanitize --script-path=/opt');
  }

  addScriptRevertFeatures() {
    this.script.push('drush -y --root=/var/www/html fra');
  }

  addScriptRunMakeFile() {
    var makeArgs = '';
    var makeArgsList = this.options.makeArgs || [];

    if (!Array.isArray(makeArgsList)) {
      makeArgsList = [makeArgsList];
    }

    if (this.options.makeForceComplete) {
      makeArgsList.push('--force-complete');
    }

    if (makeArgsList.length) {
      makeArgs = makeArgsList.join(' ');
    }

    this.script.push(
      'cd $SRC_DIR ; drush -y make ' +
        this.options.makeFile +
        ' /var/www/html ' +
        makeArgs
    );
    this.script.push(
      'rsync -a $SRC_DIR/ /var/www/html/profiles/' + this.options.profileName
    );
  }

  addScriptClearCaches() {
    if (this.options.drupalVersion >= 8) {
      this.script.push('drush -y --root=/var/www/html cache-rebuild');
    } else {
      this.script.push('drush -y --root=/var/www/html cache-clear all');
    }
  }

  addScriptFileProxy() {
    this.script = this.script.concat(
      'drush -y --root=/var/www/html en stage_file_proxy -y',
      'drush -y --root=/var/www/html vset stage_file_proxy_hotlink 1',
      `drush -y --root=/var/www/html vset stage_file_proxy_origin '${this.options.fileProxy}'`
    );
  }

  drupalVersionSupported() {
    const v = this.options.drupalVersion;
    return (
      v <= constants.MAX_DRUPAL_VERSION && v >= constants.MIN_DRUPAL_VERSION
    );
  }

  addScriptUnsupportedDrupalVersion() {
    this.script.push('echo "Build stopped: Unsupported Drupal version."');
    this.script.push('exit 1');
  }

  addVarnishDrupalVcl() {
    let options = this.options.varnish;
    if (!this.isEmptyObject(options)) {
      if (
        options.hasOwnProperty('enable') &&
        this.sanitizeValue(options.enable) === true
      ) {
        if (!options.hasOwnProperty('pathToVcl')) {
          this.script.push(
            'cp /etc/varnish/drupal-default.vcl /etc/varnish/default.vcl'
          );
          this.script.push('service varnish reload');
        }
      }
    }
  }
}

module.exports = Drupal;
