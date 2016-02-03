'use strict';

var LAMPApp = require('./LAMPApp');
var configFiles = require('./wordpress/config');

class WordPressApp extends LAMPApp {


  /**
   * Options (used by this task):
   *   @param {object} container - An instantiated and configured Container object.
   *   @param {object} options - A hash of configuration options specific to this task.
   *   @param {string} options.devDomain - The url of the dev site. This is replaced by the probo url in the db.
   *   @param {string} options.devHome - The homepage url of the dev site (including the domain). This is replaced by
   *      the probo url in the db.
   *   @param {string} options.database - The filename of the database to import if specified. Note that this database
   *      *must be added to the assets array separately*.
   *   @param {string} [options.databaseName] - The name of the database. Defaults to 'wordpress'.
   *   @param {boolean} [options.databaseGzipped] - Whether the database was sent gzipped and whether it should therefore
   *      be gunzipped before importing.
   *   @param {string} [options.subDirectory] - The directory of the actual web root (defaults to 'docroot').
   *   @param {boolean} [options.flushCaches] - Whether to flush the cache.
   *   @augments LAMPApp
   */
  constructor(container, options) {
    super(container, options);
    this.databaseName = options.databaseName || 'wordpress';

    this.options.siteFolder = options.siteFolder || 'default';
    this.options.profileName = options.profileName || 'standard';
    this.options.flushCaches = (options.flushCaches || typeof options.flushCaches === 'undefined');
    this.options.devHome = options.devHome;
    this.options.devDomain = options.devDomain;
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
    return `${this.plugin} 'Provisioning WordPress!'`;
  }

  /**
   *
   */
  populateScriptArray() {
    this.addScriptSetup();
    this.addScriptSymlinks();
    this.addScriptCreateDatbase();
    this.addScriptImportDatabase();
    this.addScriptAppendWPConfigSettings();
    this.addScriptReplaceDomain();
    if (this.options.flushCaches) {
      this.addScriptFlushCaches();
    }
    this.addScriptApachePhp();
  }

  addScriptAppendWPConfigSettings() {
    this.script.push(`echo "This is maybe a test0";`);
    this.script = this.script.concat([
      // create a wp-config file if needed and insert the snippet at the correct line number
      `if [ ! -a "/var/www/html/wp-config.php" ] ; then`,
      `  echo "${configFiles.wpDefaultConfig}" > /var/www/html/wp-config.php`,
      'fi',
      // Prepend the probo-config.php file to the wp-config file.
      `sed -i "1i <?php require('probo-config.php'); ?>" /var/www/html/wp-config.php`,

      // Create the probo-config file to override any user defined settings.
      `echo "<?php`,
      `define('DB_NAME', 'wordpress');`,
      `define('DB_USER', 'root');`,
      `define('DB_PASSWORD', 'strongpassword');`,
      `define('DB_HOST', 'localhost');`,
      `?>" >> /var/www/html/probo-config.php;`,
    ]);
  }

  addScriptUpdatePlugins() {
    this.script.push('cd $SRC_DIR ; wp plugin update');
  }

  addScriptFlushCaches() {
    this.script.push('cd $SRC_DIR ; wp cache flush');
  }

  addScriptReplaceDomain() {
    this.script.push(`export DEV_HOME=${this.options.devHome}`);
    this.script.push(`export DEV_DOMAIN=${this.options.devDomain}`);

    // flatten home page url first, so that it points to probo root
    this.script.push(this.replaceOption('$BUILD_DOMAIN', 'home'));
    this.script.push(this.replaceTextDb('$DEV_HOME', '$BUILD_DOMAIN'));

    this.script.push(this.replaceOption('$BUILD_DOMAIN', 'siteurl'));
    this.script.push(this.replaceTextDb('$DEV_DOMAIN', '$BUILD_DOMAIN'));
  }

  /**
   * Use wp-cli to replace an option.
   * @param {string} updated - The new value for the option.
   * @param {string} option - The option to replace.
   * @return {string} - The wp-cli command.
   */
  replaceOption(updated, option) {
    var command = `cd $SRC_DIR/${this.subDirectory} ; wp option update ${option} ${updated} `;
    return command;
  }

  /**
   * Use wp-cli to replace text in the database.
   * @param {string} orig- The original string.
   * @param {string} updated - The new string.
   * @return {string} - The wp-cli command.
   */
  replaceTextDb(orig, updated) {
    var command = `cd $SRC_DIR/${this.subDirectory} ; wp search-replace '${orig}' '${updated}' --skip-columns=guid`;
    return command;
  }
}

module.exports = WordPressApp;
