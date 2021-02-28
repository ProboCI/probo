'use strict';

var Script = require('./Script');
var constants = require('./constants');


class Perl extends Script {

  /**
   * Options (used by this task):
   *   @param {object} container - An instantiated and configured Container object.
   *   @param {object} options - A hash of configuration options specific to this task.
   *   @param {string} [options.perlPackages] - This list of Perl packages to be installed.
   *   @param {bool} [options.runTests] - A boolean value of whether or not to run tests as part of installs.
   */
  constructor(container, options) {

    super(container, options);

    this.options.perlPackages = options.perlPackages || [];
    this.options.runTests = options.runTests || 'true';

    this.script = [];
    this.populateScriptArray();
    this.setScript(this.script);
  }

  description() {
    return `${this.plugin} 'Handling Perl packages.'`;
  }

  /**
   * Run the script which populates our array. This generally calls our
   * other checks.
   */
  populateScriptArray() {
    this.addCPANPackages();
  }

  /**
   * Add CPAN packages using cpanm to avoid interactivity entanglements.
   * Also check to make sure what we're being passed is an array and not
   * something else. If it is something else, we need to throw a message.
   */
  addCPANPackages() {
    var packages = this.options.perlPackages;
    if (Array.isArray(packages)) {
      var packageList = packages.join(' ');
      if (this.options.runTests == 'true') {
        this.script = this.script.concat('cpanm ' + packageList);
      }
      else {
        this.script = this.script.concat('cpanm -n ' + packageList);
      }
    }
    else {
      this.script = thi.script.concat('echo "Perl packages not passed in via an array."');
    }
  }
}

module.exports = Perl;
