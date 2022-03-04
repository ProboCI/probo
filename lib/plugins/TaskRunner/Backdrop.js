'use strict';

const shellEscape = require('shell-escape');
const crypto = require('crypto');

const constants = require('./constants');
const LAMPApp = require('./LAMPApp');

class Backdrop extends LAMPApp {
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

    this.databaseName = this.options.databaseName || 'backdrop';
    this.options.databasePrefix = this.options.databasePrefix || '';

    // TODO: Add some kind of validation.
    // Filter out secret strings
    options.secrets = [];

    // Allow for subdirectory to be explicitly set to "" without being overwritten for being falsy.
    this.subDirectory = options.subDirectory || 'docroot';
    this.script = [];

    this.populateScriptArray();
    this.setScript(this.script);
  }

  description() {
    return `${this.plugin} 'Provisioning Backdrop CMS!'`;
  }

  populateScriptArray() {
    this.addScriptSetup();
    this.addScriptSymlinks();
    this.addScriptCreateDatabase();
    this.addScriptAppendSettingsPHPSettings();
    this.addScriptPublicFilesDirectory();
    if (this.options.database) {
      this.addScriptImportDatabase();
    }
    // if (this.options.varnish) {
    //   this.addVarnishDrupalVcl();
    // }
    this.addScriptApachePhp();
    this.addScriptMysql();
  }

  addScriptAppendSettingsPHPSettings() {
    this.appendBackdropSettings();
    this.appendCustomSettings();
  }

  appendBackdropSettings() {
    this.script = this.script.concat([
      'PHP_SNIPPET=$(cat <<END_HEREDOC',
      "\\$database = 'mysql://$DATABASE_USER:$DATABASE_PASS@localhost/$DATABASE_NAME';",
      '\\$database_prefix = ',
      `'${this.options.databasePrefix}';`,
      `END_HEREDOC`,
      `)`,
      `if [ ! -e "/src/settings.php" ] ; then`,
      `  echo '<?php\n' > /src/settings.php`,
      'fi',
      `echo "$PHP_SNIPPET" >> /src/settings.php`,
    ]);
  }

  appendCustomSettings() {
    if (this.options.settingsRequireFile) {
      const command =
        'echo "require_once(\'' +
        this.options.settingsRequireFile +
        '\');" >> /var/www/html/settings.php';
      this.script.push(command);
    }
    if (this.options.settingsAppend) {
      const command =
        'echo ' +
        shellEscape([this.options.settingsAppend]) +
        ' >> /var/www/html/settings.php';
      this.script.push(command);
    }
  }

  addScriptPublicFilesDirectory() {
    this.script = this.script.concat([
      'mkdir -p /var/www/html/files',
      'chown www-data:www-data -R /var/www/html/files',
    ]);
  }

  // addVarnishDrupalVcl() {
  //   let options = this.options.varnish;
  //   if (!this.isEmptyObject(options)) {
  //     if (
  //       options.hasOwnProperty('enable') &&
  //       this.sanitizeValue(options.enable) === true
  //     ) {
  //       if (!options.hasOwnProperty('pathToVcl')) {
  //         this.script.push(
  //           'cp /etc/varnish/drupal-default.vcl /etc/varnish/default.vcl'
  //         );
  //         this.script.push('service varnish reload');
  //       }
  //     }
  //   }
  // }
}

module.exports = Backdrop;
