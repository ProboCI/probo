'use strict';

var uuid = require('node-uuid');
var events = require('events');
var through2 = require('through2');
const MagicThrough = require('../../MagicThrough');
var split2 = require('split2');
var Resolver = require('multiple-callback-resolver');
var es = require('event-stream');
var combine = require('stream-combiner');

// Symbols used to make private properties inaccessible outside this class.
var _build = Symbol('_build');
var _container = Symbol('_container');
var _logger = Symbol('_logger');
var _stream = Symbol('_stream');
var _stderr = Symbol('_stderr');
var _stdin = Symbol('_stdin');
var _stdout = Symbol('_stdout');
var _timer = Symbol('_timer');

const DEFAULT_TIMEOUT = 1200000;

/**
 * @class
 */
class AbstractStep extends events.EventEmitter {

  /**
   * @param {Object} container - The probo container object to run this step inside.
   * @param {Object} options - An options hash.
   * @param {String} options.build - The build used in this step.
   * @param {String} options.id - The id for the build, defaults to a random UUID if not specified.
   * @param {Boolean} options.continueOnFailure - Whether the calling code should continue should this step in the process fail (see the Build class).
   * @param {Boolean} options.optional - Whether the calling code should consider this entire process a failure if this step should fail (see the Builds class).
   * @param {String} options.name - The name for this step, defaults to `[Classname ] step`.
   * @param {Number} options.tiemout - How long to let this step run without enforcing a timeout.
   * @param {Int} options.timeout - The number of miliseconds to let this run, defaults to (20 minutes).
   */
  constructor(container, options) {
    super();
    options = options || {};

    if (this.constructor === AbstractStep) {
      throw new Error('Can\'t instantiate abstract class AbstractStep');
    }

    options = options || {};

    this.secrets = options.secrets || [];

    // This grab-bag is set here for extending classes.
    this.options = options;

    // The probo Container to run this step on.
    this.container = container;

    var logOptions = {
      stepId: this.id,
      component: `${this.plugin} [${this.name}]`,
    };
    this.log = this.container.log.child(logOptions);

    this.plugin = this.constructor.name;

    this.id = options.id || uuid.v4();
    this.continueOnFailure = options.continueOnFailure || false;
    this.optional = options.optional || false;
    this.timeout = options.timeout || DEFAULT_TIMEOUT;
    this.name = options.name || this.plugin + ' step';
    this[_build] = options.build;
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
    this[_stdout] = through2();
    this[_stderr] = through2();
    this[_stdin] = false;
    var self = this;
    this.stream.on('end', function() {
      self.log.error(`^^ ${self.name} stream ended`);
    });
    this._attachStreams();

    this.run = this.run.bind(this);
    this.handleTimeout = this.handleTimeout.bind(this);

    this.exec = null;
    this.exitCode = null;

  }

  set container(container) {
    this[_container] = container;
  }

  get container() {
    return this[_container];
  }

  set log(logger) {
    this[_logger] = logger;
  }

  get log() {
    return this[_logger];
  }

  _attachStreams() {
    var self = this;
    var resolver = new Resolver({nonError: true});
    resolver.resolve(function() {
      self.stream.end();
    });
    self.stdout.on('end', resolver.createCallback());
    self.stderr.on('end', resolver.createCallback());
    self.stdout
      .pipe(self._getObjectTransformStream('stdout', resolver.createCallback()))
      .pipe(self.stream, {end: false});
    self.stderr
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

  get stdout() {
    return this[_stdout];
  }

  get stderr() {
    return this[_stderr];
  }

  getStream() {
    return this.stream;
  }

  set stdin(stream) {
    this[_stdin] = stream;
  }

  get stdin() {
    if (!this[_stdin]) {
      throw new Error('The exec has not been started and stdin does not exist.');
    }
    return this[_stdin];
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

    self._run(function(error, data) {
      if (error) return self.errorHandler(error, 'Running command failed.', done);
      self.exitCode = data.exitCode;
      clearTimeout(self[_timer]);
      if (error) return self.errorHandler(error, `${self.name}: Failed to exec command: ${error.message}`, done);
      self.endTime = Date.now();
      if (done) {
        done();
      }
    });
  }

  _run(done) {
    var self = this;

    // TODO: Actually specify whether to attach stdin/a tty.
    var exec = self.container.exec(this.buildCommand(), function(error, data) {
      if (error) return self.errorHandler(error, 'Container exec failed', done);
      self.exitCode = data.exitCode;


      self.updateStatus({
        state: data.exitCode === 0 ? 'success' : 'error',
        action: 'finished',
      });

      done(self.error, data);
    });
    self.stdin = exec.stdin;
    exec.stdout
      .pipe(self._getStringifyStream())
      .pipe(self.filterSecrets(self.secrets))
      .pipe(split2())
      .pipe(self.stdout);

    exec.stderr
      .pipe(self._getStringifyStream())
      .pipe(self.filterSecrets(self.secrets))
      .pipe(split2())
      .pipe(self.stderr);
    exec.on('running', self.emit.bind(self, 'running'));
  }

  /**
   * Filters out secret strings from the output of the input stream or
   * streams. Returns a new stream.
   *
   * @param {Array} secrets - an array of strings to replace with
   *                          '<*****>'. Ignores null, undefined, and
   *                          falsey values.
   * @return {Stream} - A new stream whose output is filtered.
   */
  filterSecrets(secrets) {
    var filters = secrets.map(function(secret) {
      if (secret) {
        return es.replace(secret, '<*****>');
      }
      else {
        return through2();
      }
    });
    return combine(filters);
  }

  handleTimeout() {
    this.error = new Error(`${this.name} exited due to timeout.`);
    this.emit('timeout', this.error);
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
