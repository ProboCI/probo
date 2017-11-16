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
   *   @param {boolean} options.databaseGzipped - Whether the database was sent gzipped and whether it should therefore be gunzipped before importing.
   *   @param {boolean} options.databaseBzipped - Whether the database was sent bzipped and whether it should therefore be bunzipped before importing.
   *   @param {boolean} options.databasePrefix - A prefix for the database.
   *   @param {boolean} options.databaseUpdates - Determines whether to run `drush updb`.
   *   @param {boolean} options.revertFeatures - Whether to revert features using `drush fra`.
   *   @param {integer} options.drupalVersion - The version of Drupal being used. If set, alters the behavior of certain options, such as clearCaches.
   *   @param {string} options.makeFile - The name of the make file to run to generate the install directory.
   *   @param {boolean} options.runInstall - If set, run `drush site-install` to perform a fresh install of the site using the profileName as the profile to install and allowing instlallArgs to configure the install.
   *   @param {string} options.profileName - The profileName, used in symlinking this directory if makeFile is specified and used to select the profile to install if `runInstall` is selected.
   *   @param {string} options.installArgs - A set of params to concat onto the drush `site-install` command (defaults to '').
   *   @param {string} options.subDirectory - The directory of the actual web root (defaults to 'docroot').
   *   @param {string} options.configSyncDirectory - The config sync directory used in Drupal 8.
   *   @param {string} [options.settingsAppend] - A snippet to append to the end of the settings.php file.
   *   @param {string} [options.settingsRequireFile] - A file to require at the end of settings.php (in order to get around not
   *      checking settings.php into your repo).
   *   @augments LAMPApp
   */
  constructor(container, options) {
    super(container, options);

    this.databaseName = constants.DRUPAL_DATABASE_NAME;
    this.options.databasePrefix = this.options.databasePrefix || '';
    this.options.siteFolder = options.siteFolder || 'default';
    this.options.profileName = options.profileName || 'standard';
    // clearCaches must be set to explicitly false
    this.options.clearCaches = (options.clearCaches || typeof options.clearCaches === 'undefined');
    this.options.drupalVersion = options.drupalVersion || constants.DEFAULT_DRUPAL_VERSION;

    // TODO: Add some kind of validation.
    // Filter out secret strings
    options.secrets = [
    ];

    // Allow for subdirectory to be explicitly set to "" without being overwritten for being falsy.
    this.subDirectory = options.subDirectory || 'docroot';
    this.script = [];
    if (this.drupalVersionSupported()) {
      this.populateScriptArray();
    }
    else {
      // I'd like to throw an error instead of adding this message but then the
      // build hands with no feedback.
      this.addScriptUnsupportedDrupalVersion();
    }
    this.setScript(this.script);
  }

  description() {
    return `${this.plugin} 'Provisioning Drupal!'`;
  }

  /**
   *
   */
  populateScriptArray() {
    this.addScriptSetup();
    if (this.options.makeFile) {
      this.addScriptRunMakeFile();
    }
    else {
      this.addScriptSymlinks();
    }
    this.addScriptCreateDatbase();
    this.addScriptAppendSettingsPHPSettings();
    this.addScriptPublicFilesDirectory();
    if (this.options.database) {
      this.addScriptImportDatabase();
    }
    if (this.options.drupalVersion >= 8 && this.options.database) {
      this.addScriptClearCaches();
    }
    if (this.options.runInstall) {
      this.addScriptRunInstall();
    }
    if (this.options.databaseUpdates) {
      this.addScriptDatabaseUpdates();
    }
    if (this.options.revertFeatures) {
      this.addScriptRevertFeatures();
    }
    if (this.options.clearCaches) {
      this.addScriptClearCaches();
    }

    this.addScriptApachePhp();
  }

  addScriptAppendSettingsPHPSettings() {
    if (this.options.drupalVersion === 7) {
      this.addD7PHPSettings();
    }
    else if (this.options.drupalVersion === 8) {
      this.addD8PHPSettings();
    }
    this.appendCustomSettings();
  }

  addD7PHPSettings() {
    this.script = this.script.concat([
      `PHP_SNIPPET=$(cat <<END_HEREDOC`,
      `\\$databases = array(`,
      `  'default' => array(`,
      `    'default' => array(`,
      `      'database' => '${constants.DRUPAL_DATABASE_NAME}',`,
      `      'username' => '${constants.DATABASE_USER}',`,
      `      'password' => '${constants.DATABASE_PASSWORD}',`,
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
      `fi`,
      `echo "$PHP_SNIPPET" >> /var/www/html/sites/${this.options.siteFolder}/settings.php`,
    ]);
  }

  addD8PHPSettings() {
    const hash = crypto.createHash('sha256');
    hash.update(crypto.randomBytes(40));
    const random = hash.digest('base64').toString().replace(/[^a-zA-Z0-9]/ig, '');
    const configSyncDirectory = this.options.configSyncDirectory || `sites/default/files/config_${random}/sync`;
    this.script = this.script.concat([
      `PHP_SNIPPET=$(cat <<END_HEREDOC`,
      `\\$databases = array(`,
      `  'default' => array(`,
      `    'default' => array(`,
      `      'database' => '${constants.DRUPAL_DATABASE_NAME}',`,
      `      'username' => '${constants.DATABASE_USER}',`,
      `      'password' => '${constants.DATABASE_PASSWORD}',`,
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
      `\\$config_directories['sync'] = '${configSyncDirectory}';`,
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
      let command = 'echo "require_once(\'' + this.options.settingsRequireFile + '\');" >> /var/www/html/sites/' + this.options.siteFolder + '/settings.php';
      this.script.push(command);
    }
    if (this.options.settingsAppend) {
      let command = 'echo ' + shellEscape([this.options.settingsAppend]) + ' >> /var/www/html/sites/' + this.options.siteFolder + '/settings.php';
      this.script.push(command);
    }
  }

  addScriptPublicFilesDirectory() {
    this.script = this.script.concat([
      'mkdir -p /var/www/html/sites/' + this.options.siteFolder + '/files',
      'chown www-data:www-data -R /var/www/html/sites/' + this.options.siteFolder + '/files',
    ]);
  }

  addScriptRunInstall() {
    var installArgs = this.options.installArgs || '';
    this.script.push(`drush site-install --root=/var/www/html ${this.options.profileName} ${installArgs}`);
  }

  addScriptDatabaseUpdates() {
    this.script.push('drush --root=/var/www/html updb');
  }

  addScriptRevertFeatures() {
    this.script.push('drush --root=/var/www/html fra');
  }

  addScriptRunMakeFile() {
    this.script.push('cd $SRC_DIR ; drush make ' + this.options.makeFile + ' /var/www/html --force-complete');
    this.script.push('rsync -a $SRC_DIR/ /var/www/html/profiles/' + this.options.profileName);
  }

  addScriptClearCaches() {
    if (this.options.drupalVersion >= 8) {
      this.script.push('drush --root=/var/www/html cache-rebuild');
    }
    else {
      this.script.push('drush --root=/var/www/html cache-clear all');
    }
  }

  drupalVersionSupported() {
    const v = this.options.drupalVersion;
    return (v <= constants.MAX_DRUPAL_VERSION && v >= constants.MIN_DRUPAL_VERSION);
  }

  addScriptUnsupportedDrupalVersion() {
    this.script.push('echo "Build stopped: Unsupported Drupal version."');
    this.script.push('exit 1');
  }

}

module.exports = Drupal;
