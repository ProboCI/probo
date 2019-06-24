'use strict';

var Script = require('./Script');
var constants = require('./constants');


class Perl extends Script {

  /**
   * Options (used by this task):
   *   @param {object} container - An instantiated and configured Container object.
   *   @param {object} options - A hash of configuration options specific to this task.
   *   @param {string} [options.perlPackages] - This list of Perl packages to be installed.

   */
  constructor(container, options) {

    super(container, options);

    this.options.perlPackages = options.perlPackages || {};
    this.options.runTests = options.runTests || 'true';

    this.script = [];
    this.populateScriptArray();
    this.setScript(this.script);
  }

  description() {
    return `${this.plugin} 'Handling Perl packages.'`;
  }

  /**
   *
   */
  populateScriptArray() {
    this.addCPANPackages();
  }

 
  addCPANPackages() {
    var packages = this.options.perlPackages;
    if (!this.isEmptyObject(packages)) {
      var packageList = packages.join(' ');
      if (this.options.runTests == 'true') {
        this.script = this.script.concat('cpan -i ' + packageList);
      }
      else {
        this.script = this.script.concat('cpan -iT ' + packageList);
      }
    }
  }
  
  isEmptyObject(o) {
    return !Object.keys(o).length;
  }

}

module.exports = Perl;
