'use strict';

module.exports = class NodeJS extends require('./Script') {

  /**
   * @param {object} container - The dockerode docker container object.
   * @param {object} options - Options used by this task.
   */
  constructor(container, options) {
    super(container, options);

    let script = [];
    const version = options.nodej || '22';

    script.push('curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash');
    script.push('. "$HOME/.nvm/nvm.sh"');
    script.push('nvm install ' + version);
    script.push('node -v');
    script.push('npm -v');

    this.setScript(script);
  }

  description() {
    return 'Install NodeJS';
  }

}