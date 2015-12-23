'use strict';

var Script = require('./Script');

class LAMPApp extends Script {


  /**
   * Options (used by this task):
   *   @param {object} container - An instantiated and configured Container object.
   *   @param {object} options - A hash of configuration options specific to this task.
   *   @param {string} options.database - The file name of the database to import if specified. Note that this database *must be added to the assets array separately*.
   *   @param {string} options.databaseName - The name of the database to use.
   *   @param {string} options.databaseUser - The username of the database to use.
   *   @param {boolean} options.databaseGzipped - Whether the database was sent gzipped and whether it should therefore be gunzipped before importing.
   *   @param {string} options.subDirectory - The directory of the actual web root (defaults to 'docroot').
   */
  constructor(container, options) {
    super(container, options);

    this.databaseUser = options.databaseUser || 'lampdb';
    this.databaseName = options.databaseName || 'lampdb';
    this.options.siteFolder = options.siteFolder || 'default';
    this.options.profileName = options.profileName || 'standard';
    this.options.clearCaches = options.clearCaches || true;

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
    this.addScriptHeader();
    this.addScriptSymlinks();
    this.addScriptCreateDatbase();
    if (this.options.database) {
      this.addScriptImportDatabase();
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
        databaseImportBase = 'gunzip -c ';
      }
      else {
        databaseImportBase = 'cat ';
      }
      this.script.push(databaseImportBase + '$ASSET_DIR/' + this.options.database + ' | `drush --root=/var/www/html sql-connect`');
      this.script.push('rm $ASSET_DIR/' + this.options.database);
    }
  }

}

module.exports = LAMPApp;
