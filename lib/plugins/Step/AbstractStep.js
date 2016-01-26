'use strict';

var uuid = require('node-uuid');
var events = require('events');
var through2 = require('through2');
var split2 = require('split2');
var Resolver = require('multiple-callback-resolver');

// Symbols used to make private properties inaccessible outside this class.
var _build = Symbol('_build');
var _timer = Symbol('_timer');
var _stream = Symbol('_stream');
var _stdOutStream = Symbol('_stdOutStream');
var _stdErrStream = Symbol('_stdErrStream');
var _container = Symbol('_container');

const DEFAULT_TIMEOUT = 1200000;

/**
 * @class
 */
class AbstractStep extends events.EventEmitter {

  /**
   * @param {object} container - The probo container object to run this step inside.
   * @param {object} options - An options hash.
   * @param {string} options.id - The id for the build, defaults to a random UUID if not specified.
   * @param {Boolean} options.continueOnFailure - Whether the calling code should continue should this step in the process fail (see the Build class).
   * @param {Boolean} options.optional - Whether the calling code should consider this entire process a failure if this step should fail (see the Builds class).
   * @param {String} options.name - The name for this step, defaults to `[Classname ] step`.
   * @param {number} options.tiemout - How long to let this step run without enforcing a timeout.
   * @param {int} options.timeout - The number of miliseconds to let this run, defaults to (20 minutes).
   */
  constructor(container, options) {
    super();
    options = options || {};

    if (this.constructor === AbstractStep) {
      throw new Error('Can\'t instantiate abstract class AbstractStep');
    }

    options = options || {};

    // This grab-bag is set here for extending classes.
    this.options = options;

    // The probo Container to run this step on.
    this[_container] = container;

    this.plugin = this.constructor.name;

    this.id = options.id || uuid.v4();
    this.continueOnFailure = options.continueOnFailure || false;
    this.optional = options.optional || false;
    this.timeout = options.timeout || DEFAULT_TIMEOUT;
    this.name = options.name || this.plugin + ' step';
    this[_build] = options.build || null;
    this.state = options.state || 'pending';

    // If an error occurs during this Step set it here.
    this.error = null;

    // The attributes that will be exported when converting this object to JSON.
    this._jsonAttributes = [
      'id',
      'name',
      'plugin',
      'timeout',
      'options',
      'exitCode',
      'startTime',
      'endTime',
    ];

    // This will be the reference to the timer returned by setTimeout().
    this[_timer] = null;

    this.startTime = null;
    this.endTime = null;

    this[_stream] = through2.obj();
    this[_stdOutStream] = through2();
    this[_stdErrStream] = through2();
    this._attachStreams();

    this.run = this.run.bind(this);
    this.handleTimeout = this.handleTimeout.bind(this);

    this.exec = null;
    this.exitCode = null;

    var logOptions = {
      stepId: this.id,
      component: `${this.plugin} [${this.name}]`,
    };
    this.log = this.container.log.child(logOptions);

  }

  get container() {
    return this[_container];
  }

  _attachStreams() {
    var self = this;
    var resolver = new Resolver({nonError: true});
    resolver.resolve(function() {
      self.stream.end();
      self.stdOutStream.end();
      self.stdErrStream.end();
    });
    self.stdOutStream
      .pipe(self._getObjectTransformStream('stdout', resolver.createCallback()))
      .pipe(self.stream, {end: false});
    self.stdErrStream
      .pipe(self._getObjectTransformStream('stderr', resolver.createCallback()))
      .pipe(self.stream, {end: false});
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

  get stream() {
    return this[_stream];
  }

  get stdOutStream() {
    return this[_stdOutStream];
  }

  get stdErrStream() {
    return this[_stdErrStream];
  }

  getStream() {
    return this.stream;
  }

  /**
   * Returns a JSON representation of the plugin, which is used automatically with JSON.stringify.
   * List of JSONified properties can be overwridden with an array in 'this._jsonAttributes'.
   *
   * @return {object} - A JSON representation of this step.
   */
  toJSON() {
    var output = {};
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
    throw new Error('AbstractStep.buildCommand must be implemented by a subclass');
  }

  /**
   * Return a description string for the step. By default returns an empty string
   * @return {String} - The description of the plugin.
   */
  description() {
    return '';
  }

  get ellapsedTime() {
    if (this.startTime && this.endTime) {
      return this.endTime - this.startTime;
    }
  }

  run(done) {
    var self = this;

    this.startTime = Date.now();

    self.updateStatus({state: 'pending', action: 'running'});

    if (self.timeout) {
      self[_timer] = setTimeout(self.handleTimeout, self.timeout);
    }

    // self.log.info(self.logContext, `Running command ${self.buildOptions().Cmd.join(' ')}`);
    self._run(function(error, data) {
      if (error) return self.errorHandler(error, 'Running command failed.', done);
      self.exitCode = data.exitCode;
      clearTimeout(self[_timer]);
      if (error) return self.errorHandler(error, `${self.name}: Failed to exec command: ${error.message}`, done);
      self.endTime = Date.now();
      done();
    });
  }

  _run(done) {
    var self = this;
    var log = self.log;

    var streams = self.container.exec(this.buildCommand(), function(error, data) {
      if (error) return self.errorHandler(error, 'Container exec cailed', done);
      self.exitCode = data.exitCode;


      self.updateStatus({
        state: data.exitCode === 0 ? 'success' : 'error',
        action: 'finished',
      });

      log.info('exec completed with', data.exitCode);

      done(self.error, data);
    });

    streams.stdOut
      .pipe(self._getStringifyStream())
      .pipe(split2())
      .pipe(self.stdOutStream);

    streams.stdError
      .pipe(self._getStringifyStream())
      .pipe(split2())
      .pipe(self.stdErrStream);
  }

  handleTimeout() {
    this.error = new Error(`${this.name} exited due to timeout.`);
    this.emit('timeout', this.error);
    this.container.stop();
  }

  /**
   * Generic error handler for errors that will properly emit events.
   *
   * @param {Error} error - The error event that need to be handled.
   * @param {String} message - The error event that need to be handled.
   * @param {Function} done - The error event that need to be handled.
   */
  errorHandler(error, message, done) {
    if (typeof message === 'function') {
      done = message;
      message = null;
    }
    message = message || error.message;

    this.endTime = Date.now();
    this.updateStatus({state: 'error', action: 'finished', description: message});

    this.log.error({err: error}, message);
    var wrappedError = new Error(message);
    wrappedError.originalError = error;
    if (done) {
      done(wrappedError);
    }
  }

  /**
   * Call to emit an event that's a status update for the step
   * @param {Object} status - The status object (state, action, description)
   * @param {string} [context] - Optional context value to use. If not set, defaults to a sensible value.
   */
  updateStatus(status, context) {
    context = context || `${this.plugin}/${this.name}`;
    status.description = status.description || this.description();
    status.step = this;
    this.emit('update', context, status, this);
  }
}

module.exports = AbstractStep;
