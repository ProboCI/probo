'use strict';
var shellEscape = require('shell-escape');

module.exports = class Drupal extends require('./Script') {


  /**
   * Options (used by this task):
   *   @param {object} container - An instantiated and configured Container object.
   *   @param {object} options - A hash of configuration options specific to this task.
   *   @param {boolean} options.clearCaches - Whether to clear all caches after the build is finished. Defaults to true.
   *   @param {string} options.siteFolder - The site folder to use for this build (the folder within the drupal `sites` folder).  Defaults to `default`.
   *   @param {string} options.database - The name of the database to import if specified. Note that this database *must be added to the assets array separately*.
   *   @param {boolean} options.databaseGzipped - Whether the database was sent gzipped and whether it should therefore be gunzipped before importing.
   *   @param {boolean} options.databaseBzipped - Whether the database was sent bzipped and whether it should therefore be bunzipped before importing.
   *   @param {boolean} options.databaseUpdates - Determines whether to run `drush updb`.
   *   @param {boolean} options.revertFeatures - Whether to revert features using `drush fra`.
   *   @param {string} options.makeFile - The name of the make file to run to generate the install directory.
   *   @param {boolean} options.runInstall - If set, run `drush site-install` to perform a fresh install of the site using the profileName as the profile to install and allowing instlallArgs to configure the install.
   *   @param {string} options.profileName - The profileName, used in symlinking this directory if makeFile is specified and used to select the profile to install if `runInstall` is selected.
   *   @param {string} options.installArgs - A set of params to concat onto the drush `site-install` command (defaults to '').
   *   @param {string} options.subDirectory - The directory of the actual web root (defaults to 'docroot').
   *   @param {string} [options.settingsAppend] - A snippet to append to the end of the settings.php file.
   *   @param {string} [options.settingsRequireFile] - A file to require at the end of settings.php (in order to get around not
   *      checking settings.php into your repo).
   */
  constructor(container, options) {
    super(container, options);

    this.options.siteFolder = options.siteFolder || 'default';
    this.options.profileName = options.profileName || 'standard';
    // clearCaches must be set to explicitly false
    this.options.clearCaches = (options.clearCaches || typeof options.clearCaches === 'undefined');


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
    return `${this.plugin} 'Provisioning Drupal!'`;
  }

  /**
   *
   */
  populateScriptArray() {
    this.addScriptHeader();
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
  }

  addScriptHeader() {
    this.script = this.script.concat([
      'sleep 3',
    ]);
  }

  addScriptSymlinks() {
    this.script = this.script.concat([
      'if [ -d "$SRC_DIR/' + this.subDirectory + '" ] ; then',
      '  echo \'Subdirectory ' + this.subDirectory + ' found within code directory, creating symlink.\'',
      '  ln -s "$SRC_DIR/' + this.subDirectory + '" /var/www/html',
      'fi',
      'if [ -e "$SRC_DIR/index.php" ] ; then',
      '  echo \'Index.php found within the root of the codebase, creating symlink.\'',
      '  ln -s $SRC_DIR  /var/www/html',
      'fi',
    ]);
  }

  addScriptCreateDatbase() {
    this.script = this.script.concat([
      'echo \'Creating MySQL Database, user and granting access.\'',
      'mysql -e \'create database drupal\'',
      'mysql -e \'grant all on drupal.* to "root"@"localhost"\'',
      'mysql -e \'flush privileges\'',
    ]);
  }

  addScriptAppendSettingsPHPSettings() {
    this.script = this.script.concat([
      'PHP_SNIPPET=$(cat <<END_HEREDOC',
      '\\$databases = array(',
      '  \'default\' => array(',
      '    \'default\' => array(',
      '      \'database\' => \'drupal\',',
      '      \'username\' => \'root\',',
      '      \'password\' => \'strongpassword\',',
      '      \'host\' => \'localhost\',',
      '      \'driver\' => \'mysql\',',
      '    ),',
      '  ),',
      ');',
      'END_HEREDOC',
      ')',
      'if [ ! -e "/var/www/html/sites/' + this.options.siteFolder + '/settings.php" ] ; then',
      '  echo \'<?php\n\' > /var/www/html/sites/' + this.options.siteFolder + '/settings.php',
      'fi',
      'echo "$PHP_SNIPPET" >> /var/www/html/sites/' + this.options.siteFolder + '/settings.php',
    ]);
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

  addScriptImportDatabase() {
    if (this.options.database) {
      var databaseImportBase = '';
      if (this.options.databaseGzipped) {
        databaseImportBase = 'gunzip -c ';
      }
      else if (this.options.databaseBzipped) {
        databaseImportBase = 'bunzip2 -c ';
      }
      else {
        databaseImportBase = 'cat ';
      }
      this.script.push(databaseImportBase + ' $ASSET_DIR/' + this.options.database + ' | `drush --root=/var/www/html sql-connect`');
      this.script.push('rm $ASSET_DIR/' + this.options.database);
    }
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
    this.script.push('drush --root=/var/www/html cache-clear all');
  }

};
