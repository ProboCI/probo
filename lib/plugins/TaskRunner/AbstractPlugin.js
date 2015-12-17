'use strict';

var uuid = require('node-uuid');
var events = require('events');
var through2 = require('through2');
var split2 = require('split2');
var Resolver = require('multiple-callback-resolver');

// Symbols used to make private properties inaccessible outside this class.
var _build = Symbol();
var _timer = Symbol();

const DEFAULT_TIMEOUT = 1200000;

/**
 * @class
 */
class AbstractPlugin extends events.EventEmitter {

  /**
   * @param {object} container - The dockerode container object to run this task inside.
   * @param {object} options - An options hash.
   * @param {string} options.id - The id for the build, defaults to a random UUID if not specified.
   * @param {Boolean} options.tty - Whether to allocate a TTY for the running of this command, defaults to false.
   * @param {Boolean} options.env - An array of environment variables to set when running this step, defaults to ['PWD=/src'].
   * @param {Boolean} options.continueOnFailure - Whether the calling code should continue should this step in the process fail (see the Build class).
   * @param {Boolean} options.optional - Whether the calling code should consider this entire process a failure if this step should fail (see the Builds class).
   * @param {String} options.name - The name for this step, defaults to `[Classname ] step`.
   * @param {number} options.tiemout - How long to let this step run without enforcing a timeout.
   * @param {int} options.timeout - The number of miliseconds to let this run, defaults to (20 minutes).
   */
  constructor(container, options) {
    super();
    options = options || {};

    if (this.constructor === AbstractPlugin) {
      throw new Error('Can\'t instantiate abstract class AbstractPlugin');
    }

    options = options || {};

    // This grab-bag is set here for extending classes.
    this.options = options;

    // The probo Container to run this step on.
    this.container = container;

    this.plugin = this.constructor.name;

    this.id = options.id || uuid.v4();
    this.continueOnFailure = options.continueOnFailure || false;
    this.optional = options.optional || false;
    this.timeout = options.timeout || DEFAULT_TIMEOUT;
    this.name = options.name || this.plugin + ' step';
    this[_build] = options.build || null;
    this.state = options.state || 'pending';
    this.tty = options.tty || false;
    this.env = options.env || ['PWD=/src'];

    this._jsonAttributes = ['id', 'name', 'plugin', 'timeout', 'options', 'exitCode', 'startTime', 'endTime'];


    // This will be the reference to the timer returned by setTimeout().
    this[_timer] = null;

    this.startTime = null;
    this.endTime = null;

    this.stream = through2.obj();
    this.stdOutStream = through2();
    this.stdErrStream = through2();
    this._attachStreams();

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

  set build(build) {
    this[_build] = build;
    this.log = this.log.child({buildId: this.build.id});
  }

  get build() {
    return this[_build];
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
   * List of JSONified properties can be overwridden with an array in 'this._jsonAttributes'.
   *
   * @return {object} - A JSON representation of this task.
   */
  toJSON() {
    var output = {};
    // TODO: Revisit this prop list.
    var props = this._jsonAttributes;
    for (let name of props) {
      output[name] = this[name];
    }
    return output;
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
    // TODO: LEAKY ABSTRACTION! This should move into the container and the step should call that...
    var self = this;
    var container = self.container.dockerContainer;
    var log = self.log;

    this.startTime = Date.now();

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
