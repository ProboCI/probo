'use strict';

const Script = require('./Script');

class Node extends Script {

  /**
   * @param {Object.<string, any>} container - An instantiated and configured
   *   Container object.
   * @param {Object.<string, any>} options - Configuration options specific to
   *   this task.
   * @param {string} options.nodeVersion - The node version to use.
   * @param {string} options.mainFile - The entry file to run the application.
   */
  constructor(container, options) {

    super(container, options);

    this.version = options.nodeVersion || '10.16.3';
    this.main = options.mainFile || 'index.js';

    this.script = [];
    this.populateScriptArray();
    this.setScript(this.script);
  }

  populateScriptArray() {
    this.addScriptNvmInstall();
    this.addScriptNodeInstall();
    this.addScriptInitApp();
  }

  addScriptNvmInstall() {
    this.script = this.script.concat([
      'curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.34.0/install.sh | bash',
      'export NVM_DIR="$HOME/.nvm"',
      // Loads nvm.
      '. "$NVM_DIR/nvm.sh"',
    ]);
  }

  addScriptNodeInstall() {
    this.script = this.script.concat([
      `nvm install ${this.version} > /dev/null 2> /dev/null`,
      `nvm alias default ${this.version}`,
      'nvm use default',
    ]);
  }

  addScriptInitApp() {
    this.script = this.script.concat([
      'npm install',
    ]);
  }

}

module.exports = Node;
