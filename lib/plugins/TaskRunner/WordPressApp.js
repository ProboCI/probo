'use strict';

var LAMPApp = require('./LAMPApp');

class WordPressApp extends LAMPApp {


  /**
   * Options (used by this task):
   *   @param {object} container - An instantiated and configured Container
   *      object.
   *   @param {object} options - A hash of configuration options specific to
   *      this task.
   *   @param {string} options.database - The filename of the database to import
   *      if specified. Note that this database *must be added to the assets
   *      array separately*.
   *   @param {string} [options.wpUrl] - The url of the original site. This is
   *      replaced by the probo url in the db.
   *   @param {string} [options.wpHome] - The homepage url of the original site.
   *      This is replaced by the probo url in the db.
   *   @param {boolean} [options.updatePlugins] - If true, will attempt to update
   *      wordpress plugins to latest versions. Defaults to false.
   *   @param {string} [options.databasePrefix] - The prefix of the database.
   *      Defaults to 'wp_'.
   *   @param {string} [options.databaseName] - The name of the database.
   *      Defaults to 'wordpress'.
   *   @param {boolean} [options.databaseGzipped] - Whether the database was
   *      sent gzipped and whether it should therefore be gunzipped before
   *      importing.
   *   @param {string} [options.subDirectory] - The directory of the actual web
   *      root (defaults to 'docroot').
   *   @param {boolean} [options.flushCaches] - Whether to flush the cache.
   *      Defaults to true.
   *   @augments LAMPApp
   */
  constructor(container, options) {
    super(container, options);
    this.databaseName = options.databaseName || 'wordpress';
    this.options.siteFolder = options.siteFolder || 'default';
    this.options.profileName = options.profileName || 'standard';
    this.options.flushCaches = String(options.flushCaches) !== 'undefined' ? String(options.flushCaches).toLowerCase() === 'true' : true;
    // Allow backwards compatibility to old settings.
    this.options.wpHome = options.wpHome || options.devHome || null;
    this.options.wpDomain = options.wpDomain || options.devDomain || null;
    this.options.updatePlugins = String(options.updatePlugins).toLowerCase() === 'true';
    this.options.databasePrefix = options.databasePrefix || 'wp_';
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
    this.addScriptCreateDatabase();
    this.addScriptImportDatabase();
    this.addScriptAppendWPConfigSettings();
    this.addScriptFixFilePerms();
    this.addScriptReplaceDomain();
    if (this.options.updatePlugins) {
      this.addScriptUpdatePlugins();
    }
    if (this.options.flushCaches) {
      this.addScriptFlushCaches();
    }
    this.addScriptApachePhp();
    this.addScriptMysql();
  }

  /**
   * Two complementary scripts to handle whether there is a wp-config.php file
   * checked into the repo or not.
   */
  addScriptAppendWPConfigSettings() {

    // Override should run first, as it tests for the presence of wp-config,
    // which is generated in the Boilerplate. The grep/sed to get the line
    // number of the wp-settings include is because we want table prefix after
    // all other settings but before that include.
    this.script = this.script.concat([
      'if [ -e "/var/www/html/wp-config.php" ] ; then',
      '  WP_CONFIG_WPSETTINGS_LINE_NUMBER=$(grep -n \'wp-settings.php\' /var/www/html/wp-config.php | sed \'s/:.*//\')',
      `  sed -i "1i${this.wordpressConfigOverride()}" /var/www/html/wp-config.php`,
      `  sed -i "$(echo $WP_CONFIG_WPSETTINGS_LINE_NUMBER)i\\$table_prefix = '${this.options.databasePrefix}';" /var/www/html/wp-config.php`,
      'fi',
    ]);

    // The boilerplate is significantly more simple.
    this.script = this.script.concat([
      'mkdir -p /var/www/html',
      'if [ ! -e "/var/www/html/wp-config.php" ] ; then',
      `  echo "${this.wordpressConfigBoilerplate()}" > /var/www/html/wp-config.php`,
      'fi',
    ]);
  }

  /**
   * This is the config we use if there is no wp-config.php
   * in the repo.
   *
   * @return {string} PHP settings for Wordpress
   */
  wordpressConfigBoilerplate() {
    return `<?php
define('DB_NAME', '$DATABASE_NAME');
define('DB_USER', '$DATABASE_USER');
define('DB_PASSWORD', '$DATABASE_PASS');
define('DB_HOST', 'localhost');
define('DB_CHARSET', 'utf8');
define('DB_COLLATE', '');
define('AUTH_KEY',         'put your unique phrase here');
define('SECURE_AUTH_KEY',  'put your unique phrase here');
define('LOGGED_IN_KEY',    'put your unique phrase here');
define('NONCE_KEY',        'put your unique phrase here');
define('AUTH_SALT',        'put your unique phrase here');
define('SECURE_AUTH_SALT', 'put your unique phrase here');
define('LOGGED_IN_SALT',   'put your unique phrase here');
define('NONCE_SALT',       'put your unique phrase here');
define('WP_DEBUG', false);
\\$table_prefix = '${this.options.databasePrefix}';
if ( !defined('ABSPATH') )
	define('ABSPATH', dirname(__FILE__) . '/');
require_once(ABSPATH . 'wp-settings.php');`;
  }

  /**
   * If there is a wp-config.php, we need to add some
   * defines before the existing config, but before
   * wp-settings is called. Please note that there's no
   * need to add a <?php tag since it should already be there.
   *
   * @return {string} PHP settings to override a provided wp-config
   */
  wordpressConfigOverride() {
    return `define('DB_NAME', '$DATABASE_NAME'); \
define('DB_USER', '$DATABASE_USER'); \
define('DB_PASSWORD', '$DATABASE_PASS'); \
define('DB_HOST', 'localhost'); \
\\$table_prefix = '${this.options.databasePrefix}';
`;
  }

  addScriptUpdatePlugins() {
    this.script.push('cd /var/www/html/ ; wp plugin update --all --allow-root');
  }

  addScriptFlushCaches() {
    this.script.push('cd /var/www/html/ ; wp cache flush --allow-root');
  }

  addScriptFixFilePerms() {
    this.script = this.script.concat([
      // Ensure we have an uploads directory and that it is writable.
      'mkdir -p /var/www/html/wp-content/uploads',
      'chown www-data:www-data /var/www/html/wp-content/uploads',
      'chmod 755 /var/www/html/wp-content/uploads',
    ]);
  }

  addScriptReplaceDomain() {
    // flatten home page url first, so that it points to probo root
    this.script.push(this.replaceOption('home', '$BUILD_DOMAIN'));
    this.script.push(this.replaceOption('siteurl', '$BUILD_DOMAIN'));

    if (this.options.wpHome) {
      this.script.push(`export WP_HOME=${this.options.wpHome}`);
      this.script.push(this.replaceTextDb('$WP_HOME', '$BUILD_DOMAIN'));
    }

    if (this.options.wpDomain) {
      this.script.push(`export WP_DOMAIN=${this.options.wpDomain}`);
      this.script.push(this.replaceTextDb('$WP_DOMAIN', '$BUILD_DOMAIN'));
    }
  }

  /**
   * Use wp-cli to replace an option.
   * @param {string} orig - The original option value to replace.
   * @param {string} updated - The new value for the option.
   * @return {string} - The wp-cli command.
   */
  replaceOption(orig, updated) {
    var command = `cd /var/www/html/ ; wp option update ${orig} ${updated} --allow-root`;
    return command;
  }

  /**
   * Use wp-cli to replace text in the database.
   * @param {string} orig - The original string.
   * @param {string} updated - The new string.
   * @return {string} - The wp-cli command.
   */
  replaceTextDb(orig, updated) {
    var command = `cd /var/www/html/ ; wp search-replace '${orig}' '${updated}' --skip-columns=guid --allow-root`;
    return command;
  }
}

module.exports = WordPressApp;
