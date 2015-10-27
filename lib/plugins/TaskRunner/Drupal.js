"use strict"

module.exports = class Drupal extends require('./Script') {


  /**
   * Options (used by this task):
   *   - siteFolder: (string) The site folder to use for this build (the folder within the drupal `sites` folder.  Defaults to `default`.
   *   - database: (string) - The name of the database to be imported, must have already been uploaded and included in the `assets` key for this build.
   *   - databaseGzipped: (boolean) - Whether the database was sent gzipped and whether it should therefore be gunzipped before importing.
   *   - databaseUpdates: (boolean) - Determines whether to run `drush updb`
   *   - revertFeatures: (boolean) - Whether to revert features
   *   - installProfile: (string) - If set this install (incompatible with the `database` option).
   *   - runInstall: (string) - If set, install this profile.
   *   - installArgs: (string) - A set of params to concat onto the install script (defaults to '').
   */
  constructor(container, options) {
    super(container, options)

    this.taskOptions = options

    // TODO: Add some kind of validation.

    // Filter out secret strings
    options.secrets = [
    ]

    var subDirectory = options.subDirectory || 'docroot'
    this.script = []
    this.populateScriptArray()
    this.setScript(this.script)

  }

  description(){
    return `${this.plugin} 'Provisioning Drupal!'`
  }

  /**
   *
   */
  populateScriptArray() {
    this.addScriptHeader()
    this.addScriptSymlinks()
    this.addScriptCreateDatbase()
    this.addScriptAppendSettingsPHPSettings()
    this.addScriptPublicFilesDirectory()

    if (this.options.database) {
      this.addScriptImportDatabase()
    }
    if (this.options.runInstall) {
      this.addScriptRunInstall()
    }
    if (this.options.databaseUpdates) {
      this.addScriptDatabaseUpdates()
    }
    if (this.options.revertFeatures) {
      this.addScriptRevertFeatures()
    }
  }

  addScriptHeader() {
    this.script = this.script.concat([
      'sleep 3',
    ])
  }

  addScriptSymlinks() {
    this.script = this.script.concat([
      'if [ -d "$SRC_DIR/docroot" ] ; then',
      '  echo \'Docroot found within code directory, creating symlink.\'',
      '  ln -s "$SRC_DIR/docroot" /var/www/html',
      'fi',
      'if [ -a "$SRC_DIR/index.php" ] ; then',
      '  echo \'Index.php found within the root of the codebase, creating symlink.\'',
      '  ln -s $SRC_DIR  /var/www/html',
      'fi',
    ])
  }

  addScriptCreateDatbase() {
    this.script = this.script.concat([
      'echo \'Creating MySQL Database, user and granting access.\'',
      'mysql -e \'create database drupal\'',
      'mysql -e \'grant all on drupal.* to "root"@"localhost"\'',
      'mysql -e \'flush privileges\'',
    ])
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
      'if [ -a "$SRC_DIR/index.php" ] ; then',
      '  echo \'<?php\' > /var/www/html/sites/default/settings.php',
      'fi',
      'echo "$PHP_SNIPPET" >> /var/www/html/sites/default/settings.php',
    ])
  }

  addScriptPublicFilesDirectory() {
    this.script = this.script.concat([
      'mkdir -p /var/www/html/sites/default/files',
      'chown www-data:www-data -R /var/www/html/sites/default/files',
    ])
  }

  addScriptImportDatabase() {
    if (this.options.database) {
      var databaseImportBase = ''
      if (this.options.databaseGzipped) {
        databaseImportBase = 'gunzip -c '
      }
      else {
        databaseImportBase = 'cat '
      }
      this.script.push(databaseImportBase + ' $ASSET_DIR/' + this.options.database + ' | `drush --root=/var/www/html sql-connect`')
      this.script.push('rm $ASSET_DIR/' + this.options.database)
    }
  }

  addScriptRunInstall() {
    var installArgs = this.options.installArgs || ''
    this.script.push(`drush site-install --root=/var/www/html ${this.options.runInstall} ${installArgs}`)
  }

  addScriptDatabaseUpdates() {
    this.script.push('drush --root=/var/www/html updb')
  }
  
  addScriptRevertFeatures() {
    this.script.push('drush --root=/var/www/html fra')
  }

}
