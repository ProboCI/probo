'use strict';

var events = require('events');
var through2 = require('through2');

var intformat = require('biguint-format');
var FlakeId = require('flake-idgen');
var flakeIdGenerator = new FlakeId();
var es = require('event-stream');
var dockerRawStream = require('docker-raw-stream');

/**
 * @class
 */
class AbstractPlugin extends events.EventEmitter {

  /**
   * @param {object} container - The dockerode container object to run this task inside.
   * @param {object} options - An options hash.
   */
  constructor(container, options) {
    super();

    if (this.constructor === AbstractPlugin) {
      throw new Error('Can\'t instantiate abstract class AbstractPlugin');
    }

    this.id = intformat(flakeIdGenerator.next(), 'hex');
    options = options || {};
    this.options = options;
    this.container = container;
    this.timeout = options.timeout || 6000;
    this.plugin = this.constructor.name;
    this.name = options.name || this.plugin + ' task';
    // TODO: What should the format of this output stream be?
    this.outputStream = through2();

    // used for tracking result data such as exit code and and execution time
    this.result = {
      code: null,
      time: null,
    };

    this.log = this.container.log.child({component: `${this.plugin} [${this.name}]`});

    events.EventEmitter.call(this);
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
  }

  handleTimeout() {
    this.log.warn({exec: this.exec}, 'Task timedout');
  }

  run(done) {
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
      wrappedError.originalError = err;
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
          return errorHandler(error, `${self.name}: Failed to start command: ${error.message}`, done);
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

        // decode docker output stream
        var decode = dockerRawStream.decode();
        stream.pipe(decode);

        var combined = es.merge(decode.stdout, decode.stderr);

        self.process = {
          streams: {
            stdout: decode.stdout,
            stderr: decode.stderr,
            combined: combined,
            stdin: stream,
          },
          exec: finished,
          task: self,
        };
        self.emit('running', self.process);
        done(null, self.process);
      });
    });
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
