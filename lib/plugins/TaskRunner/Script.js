'use strict';

var through2 = require('through2');

module.exports = class Script extends require('./AbstractPlugin') {

  // requires options:
  //  - script: string to pipe to the container on stdin or an array of strings
  //  - secrets: Array of secret strings that need to be filtered out of output
  constructor(container, options) {
    super(container, options);
    options.tty = false;

    this.setScript(options.script || '');

    var self = this;
    this.on('running', function() {
      self.runScript();
    });
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
      // add build domain
      `export BUILD_DOMAIN=${this.container.build.links.build}`,

    ].concat(script);

    script = script.join('\n');

    // make sure script ends with a newline
    if (script[script.length - 1] !== '\n') {
      script = script + '\n';
    }

    this.script = script;

  }

  runScript() {
    this.createScriptStream(this.process.stream).end(this.script);
  }

  createScriptStream(dockerStream) {
    var stream = through2(
      // Transform is a noop.
      function(chunk, enc, cb) { cb(null, chunk); },
      function(cb) {
        // flush function, send 'exit' to terminate the docker process
        this.push('exit\n');
        cb();
      }
    );

    // docker stream is an HTTP Duplex stream, so we can't close it
    // from this end without terminating the connection prematurely
    stream.pipe(dockerStream, {end: false});


    // filter out secret strings
    var self = this;
    if (self.options.secrets) {
      var filtered = through2(
        function(chunk, enc, cb) {
          for (var secret of self.options.secrets) {
            chunk = chunk.toString().replace(secret, '<*****>');
          }

          cb(null, chunk);
        }
      );

      dockerStream.pipe(filtered);
      self.process.stream = filtered;
    }

    return stream;
  }

  buildCommand() {
    return ['bash'];
  }

  description() {
    return 'script';
  }
};
