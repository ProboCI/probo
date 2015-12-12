'use strict';

var events = require('events');
var Promise = require('bluebird');
var util = require('util');
var intformat = require('biguint-format');
var FlakeId = require('flake-idgen');
var flakeIdGen = new FlakeId();

/**
 * @class
   * @param {object} container - The dockerode docker container object.
   * @param {object} options - Options used by this task.
 */
var AbstractPlugin = function(container, options) {
  if (this.constructor === AbstractPlugin) {
    throw new Error('Can\'t instantiate abstract class AbstractPlugin');
  }

  this.id = intformat(flakeIdGen.next(), 'hex');

  options = options || {};
  this.options = options;
  this.container = container;
  this.timeout = options.timeout || 6000;
  this.plugin = this.constructor.name;
  this.name = options.name || this.plugin + ' task';

  // used for tracking result data such as exit code and and execution time
  this.result = {
    code: null,
    time: null,
  };

  this.run = Promise.promisify(this.run.bind(this));
  this.log = this.container.log.child({component: `${this.plugin} [${this.name}]`});

  events.EventEmitter.call(this);
};

util.inherits(AbstractPlugin, events.EventEmitter);

/**
 * Returns a JSON representation of the plugin, which is used automatically with JSON.stringify.
 * List of JSONified properties can be overwridden with an array in 'this._json_attrs'.
 *
 * @return {object} - A JSON representation of this task.
 */
AbstractPlugin.prototype.toJSON = function() {
  var ret = {};
  var props = this._json_attrs || ['id', 'name', 'plugin', 'timeout', 'options', 'result'];
  for (var i = 0; i < props.length; i++) {
    ret[props[i]] = this[props[i]];
  }
  return ret;
};


/**
 * Build the command to run (as an Array). This method must be subclassed.
 */
AbstractPlugin.prototype.buildCommand = function() {
  throw new Error('AbstractPlugin.buildCommand must be implemented by a subclass');
};

AbstractPlugin.prototype.description = function() {
  return '';
};

/**
 * Perform any necessary config for Docker exec. Called when the task runs.
 * @param {Array} [command=this.buildCommand()] - array of command parts to run in the docker container
 * @return {Object} - The options array.
 */
AbstractPlugin.prototype.buildOptions = function(command) {
  if (!command) {
    command = this.buildCommand();
  }

  return {
    // options for .exec
    AttachStdin: true,
    AttachStdout: true,
    AttachStderr: true,
    Tty: this.options.tty || false,

    // options for .start
    Detach: false,

    OpenStdout: true,

    // SSH errors were observed without having a PWD set.
    Env: this.options.env || [
      // Note: this is only used by some applications (like SSH) and
      // will not set the working directory for bash.
      'PWD=/src',
    ],
    Cmd: command,
  };
};

AbstractPlugin.prototype.handleTimeout = function() {
  this.log.warn({exec: this.exec}, 'Task timedout');
};

/**
 * Runs the configured command in the container.
 *
 * Returns a promise (see {@link AbstractPlugin} constructor) that
 * resolves when the execution starts. The promise resolves with an
 * object having: (stream, exec, task). stream is a {@link Stream} of
 * bundled stdout/stderr, exec is a Promise that resolves with
 * Docker's Exec output when the command finishes (stream ends), and
 * task is set to 'this' (the plugin instance, aka task).
 *
 * This returns a promise because it is promisifed in the constructor.
 *
 * @param {function} done - The callback to call when the task is finished.
 */
AbstractPlugin.prototype.run = function(done) {
  // TODO: This is bad - I should call this dockerContainer or something...
  var container = this.container.container;
  var log = this.log;

  var self = this;
  var start = +new Date();

  this.updateStatus({state: 'pending', action: 'running'});

  function errorHandler(err, msg) {
    msg = msg || err.message;

    self.result.time = +new Date() - start;
    self.updateStatus({state: 'error', action: 'finished', description: msg});

    log.error({err: err}, msg);
    var wrappedError = new Error(msg);
    wrappedError.original_error = err;
    return done(wrappedError);
  }

  container.exec(self.buildOptions(), function(error, exec) {
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

      return errorHandler(error, `${self.name}: Failed to exec command: ${error.message}`);
    }

    exec.start({stream: true, stdin: true, stdout: true}, function(error, stream) {
      log.info('exec started');
      if (error) {
        return errorHandler(error, `${self.name}: Failed to start command: ${error.message}`);
      }

      var finished = new Promise(function(resolve, reject) {
        stream.on('end', function() {
          log.info('exec stream ended');

          exec.inspect(function(error, data) {
            if (error) { return reject(error); }

            log.info('exec completed with', data.ExitCode);

            resolve(data);
          });
        });
      });

      // monitor status of task
      finished.then(function(data) {
        self.result.code = data.ExitCode;
        self.result.time = +new Date() - start;

        self.updateStatus({
          state: data.ExitCode === 0 ? 'success' : 'error',
          action: 'finished',
        });

        return data;
      }).catch(function(e) {
        errorHandler(e);
      });

      // // configure a timeout
      // // TODO: kill the original process when we time out
      // finished = finished.timeout(self.timeout).catch(Promise.TimeoutError, function(e) {
      //   self.handleTimeout(e)
      // })

      self.process = {stream, exec: finished, task: self};
      self.emit('running', self.process);
      done(null, self.process);
    });
  });
};

/**
 * Call to emit an event that's a status update for the task
 * @param {Object} status - The status object (state, action, description)
 * @param {string} [context] - Optional context value to use. If not set, defaults to a sensible value.
 */
AbstractPlugin.prototype.updateStatus = function(status, context) {
  context = context || `${this.plugin}/${this.name}`;
  status.description = status.description || this.description();
  status.task = this;
  this.emit('update', context, status, this);
};

module.exports = AbstractPlugin;
