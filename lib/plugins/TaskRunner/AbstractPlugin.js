'use strict';

var uuid = require('node-uuid');
var events = require('events');
var through2 = require('through2');
var Resolver = require('multiple-callback-resolver');

var es = require('event-stream');
var dockerRawStream = require('docker-raw-stream');

const DEFAULT_TIMEOUT = 1200000;

/**
 * @class
 */
class AbstractPlugin extends events.EventEmitter {

  /**
   * @param {object} container - The dockerode container object to run this task inside.
   * @param {object} options - An options hash.
   * @param {string} options.id - The id for the build, defaults to a random UUID if not specified.
   * @param {int} options.timeout - The number of miliseconds to let this run, defaults to (20 minutes).
   */
  constructor(container, options) {
    super();
    options = options || {};

    if (this.constructor === AbstractPlugin) {
      throw new Error('Can\'t instantiate abstract class AbstractPlugin');
    }

    this.id = options.id || uuid.v4();
    options = options || {};
    // This grab-bag is set here for extending classes.
    this.options = options;
    this.container = container;
    this.continueOnFailure = options.continueOnFailure || false;
    this.optional = options.optional || false;
    this.timeout = options.timeout || DEFAULT_TIMEOUT;
    this.plugin = this.constructor.name;
    this.name = options.name || this.plugin + ' task';
    // Whether to allocate a TTY for the running of this command.
    this.tty = options.tty || false;
    // TODO: Allow PWD to be specified by the task plugin? without the source downloaders the src folder won't exist.
    // Note: this is only used by some applications (like SSH) and
    // will not set the working directory for bash.
    this.env = options.env || ['PWD=/src'];
    this.startTime = null;
    this.endTime = null;
    this.stdOutStream = through2();
    this.stdErrStream = through2();
    this.stream = through2.obj();
    this._attachStreams();
    this.state = 'pending';

    this.run = this.run.bind(this);
    this.getStream = this.getStream.bind(this);


    // used for tracking result data such as exit code and and execution time
    this.result = {
      code: null,
      time: null,
    };
    var logOptions = {
      id: this.id,
      component: `${this.plugin} [${this.name}]`,
    };
    this.log = this.container.log.child(logOptions);

    events.EventEmitter.call(this);
  }

  _multiplexStream(stream, done) {
    var self = this;
    return through2.obj(function(data, enc, cb) {
      this.push({
        stream,
        data,
        stepId: self.id,
      });
      cb();
    }, done);
  }

  _attachStreams() {
    var self = this;
    var callbacks = Resolver.resolver(2, {nonError: true}, function() {
      self.stream.end();
    });
    this.stdOutStream
      .pipe(self._multiplexStream('stdout', callbacks[0]))
      .pipe(self.stream, {end: false});
    this.stdErrStream
      .pipe(self._multiplexStream('stderr', callbacks[1]))
      .pipe(self.stream, {end: false});
  }

  getStream() {
    return this.stream;
  }

  /**
   * Returns a JSON representation of the plugin, which is used automatically with JSON.stringify.
   * List of JSONified properties can be overwridden with an array in 'this._json_attrs'.
   *
   * @return {object} - A JSON representation of this task.
   */
  toJSON() {
    var ret = {};
    var props = this._json_attrs || ['id', 'name', 'plugin', 'timeout', 'options', 'result'];
    for (var i = 0; i < props.length; i++) {
      ret[props[i]] = this[props[i]];
    }
    return ret;
  }


  /**
   * Build the command to run (as an Array). This method must be subclassed.
   */
  buildCommand() {
    throw new Error('AbstractPlugin.buildCommand must be implemented by a subclass');
  }

  /**
   * Return a description string for the task. By default returns an empty string
   * @return {String} - The description of the plugin.
   */
  description() {
    return '';
  }

  /**
   * Perform any necessary config for Docker exec. Called when the task runs.
   * @param {Array} [command=this.buildCommand()] - array of command parts to run in the docker container
   * @return {Object} - The options array.
   */
  buildOptions(command) {
    if (!command) {
      command = this.buildCommand();
    }

    return {
      // options for .exec
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
      Tty: this.tty,

      // options for .start
      Detach: false,

      OpenStdout: true,
      Env: this.env,
      Cmd: command,
    };
  }

  run(done) {
    // TODO: This is bad - I should call this dockerContainer or something...
    var container = this.container.container;
    var log = this.log;

    var self = this;
    var start = +new Date();

    this.updateStatus({state: 'pending', action: 'running'});

    container.exec(self.buildOptions(), function(error, exec) {
      // TODO: Provide more context in all log messages.
      log.info('starting the exec');

      self.exec = exec;
      if (error) {
        if (error.message === 'write EPIPE') {
          self.log.error({err: error}, `${self.name}: Got an EPIPE error, retrying in 2 sec...`);
          setTimeout(function() {
            self.run(done);
          }, 2000);
          return;
        }

        return this.errorHandler(error, `${self.name}: Failed to exec command: ${error.message}`, done);
      }
      self.emit('running', self.process);
      exec.start({stream: true, stdin: true, stdout: true}, function(error, stream) {
        log.info('exec started');
        if (error) {
          return this.errorHandler(error, `${self.name}: Failed to start command: ${error.message}`, done);
        }

        stream.on('end', function() {
          log.info('exec stream ended');

          exec.inspect(function(error, data) {
            if (error) { return this.handleError(error, 'Failed to inspect exec', done); }
            self.result.code = data.ExitCode;
            self.result.time = +new Date() - start;

            self.updateStatus({
              state: data.ExitCode === 0 ? 'success' : 'error',
              action: 'finished',
            });


            log.info('exec completed with', data.ExitCode);

            done(data);
          });
        });
      });
    });
  }

  errorHandler(error, msg, done) {
    msg = msg || error.message;

    // TODO: Move elapsed time capture into its own function.
    this.result.time = +new Date() - this.start;
    this.updateStatus({state: 'error', action: 'finished', description: msg});

    this.log.error({err: error}, msg);
    var wrappedError = new Error(msg);
    wrappedError.originalError = error;
    return done(wrappedError);
  }

  /**
   * Call to emit an event that's a status update for the task
   * @param {Object} status - The status object (state, action, description)
   * @param {string} [context] - Optional context value to use. If not set, defaults to a sensible value.
   */
  updateStatus(status, context) {
    context = context || `${this.plugin}/${this.name}`;
    status.description = status.description || this.description();
    status.task = this;
    this.emit('update', context, status, this);
  }
}

module.exports = AbstractPlugin;
