'use strict';

// Global dependencies.
var shellEscape = require('shell-escape');
var crypto = require('crypto');

// Items that live inside our project.
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
   *   @param {string} [options.settingsRequireFile] - A file to require at the end of settings.php
   *   @augments LAMPApp
   */
  constructor(container, options) {
    super(container, options);

    this.redis = options.redis || false;
    this.composer = options.composer || false;
    this.databaseName = options.databaseName || 'drupal';
    this.configImport = options.configImport || false;
    this.options.databaseClean = options.databaseClean || false;
    this.options.databasePrefix = options.databasePrefix || '';
    this.options.siteFolder = options.siteFolder || 'default';
    this.options.profileName = options.profileName || 'standard';
    this.options.clearCaches = options.clearCaches || typeof options.clearCaches === 'undefined';
    this.options.databaseUpdates = options.databaseUpdates || typeof options.databaseUpdates === 'undefined';
    this.options.drupalVersion = options.drupalVersion || constants.DEFAULT_DRUPAL_VERSION;
    this.options.makeForceComplete = options.makeForceComplete || typeof options.makeForceComplete === 'undefined';

    // TODO: Add some kind of validation.
    // Filter out secret strings
    options.secrets = [];

    // Allow for subdirectory to be explicitly set to "" without being overwritten for being falsy.
    this.subDirectory = options.subDirectory || 'docroot';
    this.script = [];

    // Only get started if we're dealing with a supported version of Drupal.
    if (this.drupalVersionSupported()) {
      this.populateScriptArray();
    } else {
      // I'd like to throw an error instead of adding this message but then the
      // build ends with no feedback.
      this.addScriptUnsupportedDrupalVersion();
    }
    this.setScript(this.script);
  }

  description() {
    return `${this.plugin} 'Provisioning Drupal!'`;
  }

  // Run our script of scripts. Configure our build based on build options and available
  // configurations.
  populateScriptArray() {

    // Setup our flight deck (or bootstrap) commands. Makes sure MySQL is turned on as well
    // as installing any environment variables and included modules for PHP.
    this.addScriptSetup();

    // Run composer install if we're doing a composer install/
    this.addComposerInstall();

    // If we're using < Drupal 8, then we need to install drush since it can be installed
    // globally and normally isn't in the code repo.
    if (this.options.drupalVersion < 8) {
      this.addGlobalDrush8();
    }

    // drush make is an old mechanism for installing Drupal web sites which isn't widely
    // supported due to drush having site:install. We also want them to do this separately
    // for drupal 8+ since there are new ways to do it anyway.
    if (this.options.drupalVersion < 8 && this.options.makeFile) {
      this.addScriptRunMakeFile();
    }

    // Add the symlinks to our on-boarded git repository.
    this.addScriptSymlinks();

    // Configure apache as per passed in settings. Includes Apache and PHP modules.
    this.addScriptApachePhp();

    // Configure MySQL as per passed in configurations and restart MySQL
    // this.addScriptMysql();

    // Create the base Drupal database used by the application to set up the site.
    // this.addScriptCreateDatabase();

    // Append any configured settings.php items into our Probo.CI settings.php file.
    this.addScriptAppendSettingsPHPSettings();

    // Make sure we have a public directory and not anything else.
    this.addScriptPublicFilesDirectory();

    // Import the data from our database dump. This logic will need to change based on
    // database (mysql, postgresql, mariadb, sqlserv, sqlite)
    // if (this.options.database) {
    //   this.addScriptImportDatabase();
    // }

    // Check to see if we're running our configuration import prior to rebuilding the cache or pretty
    // doing anything else.
    this.configurationImport();

    // We either need to run drush cr (Drupal 8+) or drush cc (Drupal 7-). This is handled
    // in the function logic.
    if (this.options.clearCaches) {
      this.addScriptClearCaches();
    }

    // If we need to use our onboard redis (or told to do so) then configure it here.
    if (this.redis === true && this.options.drupalVersion >= 8) {
      this.addRedisToSettings();
    }

    // Run the drush site:install (si) command. si is the alias, so use that sincew
    // site-install is no longer a thing in modern drupal.
    if (this.options.runInstall) {
      this.addScriptRunInstall();
    }

    // Run our updb command if asked to do so.
    if (this.options.databaseUpdates) {
      this.addScriptDatabaseUpdates();
    }

    // This is sticky. Features is a pre-Drupal 8 thing and isn't used on all projects although it is
    // used on manuy projects. We should mark this deprecated.
    if (this.options.drupalVersion < 8 && this.options.revertFeatures) {
      this.addScriptRevertFeatures();
    }

    // This is deprecated. This should be handled by the site as applicable. Fails the build if
    // stage_file_proxy isn't available. It also messes with configuration in Drupal 8+. Until
    // there is another way, this should be handled via a script command.
    if (this.options.fileProxy) {
      this.addScriptFileProxy();
    }

    // We either need to run drush cr (Drupal 8+) or drush cc (Drupal 7-). This is handled
    // in the function logic.
    if (this.options.clearCaches) {
      this.addScriptClearCaches();
    }
  }

  addRedisToSettings() {
    this.script = this.script.concat([
      `REDIS_SNIPPET=$(cat <<END_HEREDOC`,
      `\\$settings['redis.connection']['interface'] = 'PhpRedis';`,
      `\\$settings['redis.connection']['host'] = 'localhost';`,
      `\\$settings['redis.connection']['port'] = 6379;`,
      `\\$settings['cache']['default'] = 'cache.backend.redis';`,
      `\\$settings['container_yamls'][] = 'modules/contrib/redis/example.services.yml';`,
      `END_HEREDOC`,
      `)`,
      `if [ ! -e "/var/www/html/sites/${this.options.siteFolder}/settings.php" ] ; then`,
      `  echo '<?php\n' > /var/www/html/sites/${this.options.siteFolder}/settings.php`,
      `fi`,
      `echo "$REDIS_SNIPPET" >> /var/www/html/sites/${this.options.siteFolder}/settings.php`,
    ]);
  }

  // Add composer install for our site if specified. Composer file must be in the root of the
  // git repository. Only applies for Drupal 8 and above.
  addComposerInstall() {
    if (this.options.drupalVersion >= 8 && this.composer === true) {
      this.script.push('cd $SRC_DIR');
      this.script.push('composer -n install');
      this.script.push('cd');
    }
  }

  // If we're configured to rebuild the cache in our Drupal plugin, then execute it with this method.
  configurationImport() {
    if (this.configImport === true) {
      this.script.push('cd $SRC_DIR/' + this.subDirectory);
      this.script.push('drush -r /var/www/html cim -y');
      this.script.push('cd');
    }
  }

  // Install Drush 8 globally. This is for Drupal versions 7 and below.
  addGlobalDrush8() {
    if (this.options.drupalVersion <= 7) {
      this.script.push(
        'ln -s /usr/local/src/drush8/vendor/bin/drush /usr/local/bin/drush'
      );
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
    if (redis) { }
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
      `      'driver' => 'mysql',`,
      `      'port' => '3306',`,
      // This is pretty gross. We should find a better way to handle this.
      `      'namespace' => 'Drupal\\\\\\\\Core\\\\\\\\Database\\\\\\\\Driver\\\\\\\\mysql',`,
      `      'driver' => 'mysql',`,
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
      `      'driver' => 'mysql',`,
      `      'port' => '3306',`,
      // This is pretty gross. We should find a better way to handle this.
      `      'namespace' => 'Drupal\\\\\\\\Core\\\\\\\\Database\\\\\\\\Driver\\\\\\\\mysql',`,
      `      'driver' => 'mysql',`,
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
      'chown www-data:www-data -R /var/www/html/sites/' +
        this.options.siteFolder +
        '/files',
    ]);
  }

  addScriptRunInstall() {
    var installArgs = this.options.installArgs || '';
    this.script.push(
      `drush -y si --root=/var/www/html ${this.options.profileName} ${installArgs}`
    );
  }

  addScriptDatabaseUpdates() {
    this.script.push('drush -y --root=/var/www/html updb');
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
      this.script.push('drush -y --root=/var/www/html cr');
    } else {
      this.script.push('drush -y --root=/var/www/html cc all');
    }
  }

  // Deprecated function. Here as a stub so it does not error for the time being.
  addScriptFileProxy() {
    this.script = this.script.concat();
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
  
}

module.exports = Drupal;
