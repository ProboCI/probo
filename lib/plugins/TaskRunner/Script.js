'use strict';

var through2 = require('through2');
var es = require('event-stream');
var combine = require('stream-combiner');

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
      'export PS4=\'$ \'',
      // Enables command echoing.
      'set -ux',
      // Default CWD to $SRC_DIR (create it if it it doesn't exist).
      'mkdir -p $SRC_DIR; cd $SRC_DIR',
    ].concat(script);

    script = script.join('\n');

    // make sure script ends with a newline
    if (script[script.length - 1] !== '\n') {
      script = script + '\n';
    }

    this.script = script;

  }

  runScript() {
    this.createScriptStream().end(this.script);
  }

  createScriptStream() {
    var inputStream = through2(
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
    inputStream.pipe(this.process.streams.stdin, {end: false});


    // make sure that secrets don't escape in any of the output streams
    var self = this;
    self.process.streams.filtered = {};
    ['stdout', 'stderr', 'combined'].forEach(function(streamName) {
      self.process.streams.filtered[streamName] = self.filterSecrets(
        self.options.secrets, self.process.streams[streamName]
      );
    });

    return inputStream;
  }

  /**
   * Filters out secret strings from the output of the input stream or
   * streams. Returns a new stream.
   *
   * @param {Array} secrets - an array of strings to replace with
   *                          '<*****>'. Ignores null, undefined, and
   *                          falsey values.
   * @param {Stream} stream - The stream to filter.
   *
   * @return {Stream} - A new stream whose output is filtered.
   */
  filterSecrets(secrets, stream) {
    secrets = secrets || [];

    var filters = secrets.map(function(secret) {
      if (secret) {
        return es.replace(secret, '<*****>');
      }
      else {
        return through2();
      }
    });
    var filter = combine(filters);

    stream.pipe(filter);

    return filter;
  }

  buildCommand() {
    return ['bash'];
  }

  description() {
    return 'script';
  }
};
