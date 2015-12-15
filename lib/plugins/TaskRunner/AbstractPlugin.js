'use strict';

var uuid = require('node-uuid');
var events = require('events');
var through2 = require('through2');
var split2 = require('split2');
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

    this.exec = null;
    this.exitCode = null;

    var logOptions = {
      stepId: this.id,
      component: `${this.plugin} [${this.name}]`,
    };
    this.log = this.container.log.child(logOptions);

    events.EventEmitter.call(this);
  }

  _getObjectTransformStream(stream, done) {
    var self = this;
    return through2.obj(function(data, enc, cb) {
      this.push({
        stream,
        data: data.toString(),
        stepId: self.id,
        time: Date.now(),
      });
      cb();
    }, done);
  }

  _getStringifyStream() {
    return through2(function(data, enc, cb) {
      cb(null, data.toString());
    });
  }

  _attachStreams() {
    var self = this;
    var callbacks = Resolver.resolver(2, {nonError: true}, function() {
      self.stream.end();
    });
    this.stdOutStream
      .pipe(self._getObjectTransformStream('stdout', callbacks[0]))
      .pipe(self.stream, {end: false});
    this.stdErrStream
      .pipe(self._getObjectTransformStream('stderr', callbacks[1]))
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

  retryRun(error, done) {
    var self = this;
    self.log.error({stepId: this.id, err: error}, `${self.name}: Got an EPIPE error, retrying in 2 sec...`);
    setTimeout(function() {
      self.run(done);
    }, 2000);
  }

  get logContext() {
    var logContext = {
      stepId: this.id,
      containerId: this.container.containerId,
    };
    if (this.exec) {
      logContext.execId = this.exec.id;
    }
    if (this.build) {
      logContext.buildId = this.build.id;
    }
    return logContext;
  }

  get ellapsedTime() {
    if (this.startTime && this.endTime) {
      return this.endTime - this.startTime;
    }
  }

  run(done) {
    // TODO: This is bad - I should call this dockerContainer or something...
    var container = this.container.container;
    var log = this.log;

    var self = this;
    var start = +new Date();

    this.updateStatus({state: 'pending', action: 'running'});

    self.updateStatus({state: 'pending', action: 'running'});

    self.log.info(self.logContext, `Running command ${self.buildOptions().Cmd.join(' ')}`);

    container.exec(self.buildOptions(), function(error, exec) {
      self.exec = exec;
      if (error) {
        if (error.message === 'write EPIPE') return self.retryRun(error, done);

        return this.errorHandler(error, `${self.name}: Failed to exec command: ${error.message}`, done);
      }

      log.info(self.logContext, 'starting the exec');
      exec.start({stream: true, stdin: true, stdout: true}, function(error, stream) {
        var rawStdout = self._getStringifyStream();
        var rawStderr = self._getStringifyStream();
        container.modem.demuxStream(stream, rawStdout, rawStderr);
        rawStdout
          .pipe(split2())
          .pipe(self.stdOutStream);
        rawStderr
          .pipe(split2())
          .pipe(self.stdErrStream);
        log.info('exec started');
        if (error) {
          return this.errorHandler(error, `${self.name}: Failed to start command: ${error.message}`, done);
        }

        stream.on('end', function() {
          log.info('exec stream ended');

          exec.inspect(function(error, data) {
            if (error) { return self.handleError(error, 'Failed to inspect exec', done); }
            self.exitCode = data.ExitCode;
            self.endTime = Date.now();

            self.updateStatus({
              state: data.ExitCode === 0 ? 'success' : 'error',
              action: 'finished',
            });


            log.info('exec completed with', data.ExitCode);

            done(null, data);
          });
        });
      });
    });
  }

  errorHandler(error, msg, done) {
    msg = msg || error.message;

    // TODO:  Move this to a generic end handler?
    this.endTime = Date.now();
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
