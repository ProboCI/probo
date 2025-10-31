'use strict';

module.exports = class NodeJS extends require('./Script') {

  /**
   * @param {object} container - The dockerode docker container object.
   * @param {object} options - Options used by this task.
   */
  constructor(container, options) {
    super(container, options);

    let script = [];
    const version = options.nodejs || '22';

    script.push('nvm install ' + version);
    script.push('nvm use ' + version);
    script.push('nvm alias default ' + version);

    this.setScript(script);
  }

  description() {
    return 'Install NodeJS';
  }

}