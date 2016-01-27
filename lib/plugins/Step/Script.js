'use strict';

var AbstractStep = require('./AbstractStep');

class Script extends AbstractStep {

  // requires options:
  //  - script: string to pipe to the container on stdin or an array of strings
  //  - secrets: Array of secret strings that need to be filtered out of output
  constructor(container, options) {
    super(container, options);
    options.tty = false;

    this.setScript(options.script || '');

    this.on('running', this.runScript.bind(this));
  }

  setScript(script) {

    if (!Array.isArray(script)) {
      script = script.split('\n');
    }


    // Set up terminal niceness
    script = [
      // Don't keep track of history.
      'unset HISTFILE',
      // Set command echo prefix to '$' from a default of '+'.
      'export PS4=\'\$ \'',
      // Enables command echoing.
      'set -x',
      // Default CWD to $SRC_DIR (create it if it it doesn't exist).
      'mkdir -p $SRC_DIR; cd $SRC_DIR',
    ].concat(script);
    script.push('exit');

    script = script.join('\n');

    // make sure script ends with a newline
    if (script[script.length - 1] !== '\n') {
      script = script + '\n';
    }

    this.script = script;

  }

  runScript() {
    this.stdInStream.write(this.script);
  }

  buildCommand() {
    return ['bash'];
  }

  description() {
    return 'script';
  }
}

module.exports = Script;
