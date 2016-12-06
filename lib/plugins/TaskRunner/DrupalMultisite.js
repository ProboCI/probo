'use strict';
var shellEscape = require('shell-escape');
var crypto = require('crypto');

var constants = require('./constants');

var Drupal = require('./Drupal');
var LAMPApp = require('./LAMPApp');

class DrupalMultisite extends LAMPApp {

  /**
   * Options (used by this task in addition to the Drupal options):
   *   @param {array} options.sites - A hash of sites. Each site supports the same options as the Drupal plugin, except for @TODO.
   *   @augments Drupal
   */
  constructor(container, options) {
    super(container, options);

    this.script = [];
    this.populateScriptArray();
    this.setScript(this.script);
  }

  description() {
    return `${this.plugin} 'Provisioning Drupal Multisite!'`;
  }

  populateScriptArray() {
    this.addScriptSetup();
    if (this.options.makeFile) {
      this.addScriptRunMakeFile();
    }
    else {
      this.addScriptSymlinks();
    }

    /**
     * Loop through each site, merging the plugin options with the site options.
     * Virtualize the script output from a Drupal app (skipping the setup), and
     * add that to our script. Track which databases have already been imported
     * and only import each one once.
     */
    for (var site in this.options.sites) {
      if (this.options.sites.hasOwnProperty(site)) {
        var drupal;
        var importedDatabases = [];
        var site_options = this.options.sites[site];
        site_options.siteFolder = this.options.siteFolder || site;
        site_options.alias = site;
        site_options.virtualize = true;
        site_options.skipSetup = true;
        site_options = Object.assign({}, this.options, site_options);

        if (site_options.database) {
          if (importedDatabases.indexOf(site_options.database) != -1) {
            site_options.skipDatabase = true;
          }
          importedDatabases.push(site_options.database);
        }

        drupal = new Drupal(this.container, site_options);
        this.script = this.script.concat(drupal.script);
      }
    }
    this.addScriptApachePhp();
  }

  // @TODO - this is going to cause problems someday. We should make a Drupal-like
  // Plugin that extends LAMPApp, and then Drupal and DrupalMultisite can extend that.
  addScriptRunMakeFile() {
    this.script.push('cd $SRC_DIR ; drush make ' + this.options.makeFile + ' /var/www/html --force-complete');
    this.script.push('rsync -a $SRC_DIR/ /var/www/html/profiles/' + this.options.profileName);
  }
}

module.exports = DrupalMultisite;
