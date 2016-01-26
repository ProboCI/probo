'use strict';

var through2 = require('through2');
var logger = require('./logger');
// Note: we use this project because the demuxer in dockerode never closes child streams.
var dockerDecoder = require('docker-raw-stream');

// Symbols for use in the creation of private properties.
var _container = Symbol('_container');
var _exec = Symbol('_exec');
var _stdinStream = Symbol('_stdinStream');
var _stdoutStream = Symbol('_stdoutStream');
var _stderrStream = Symbol('_stderrStream');


class ContainerExec {

  /**
   * @param {Object} container - The probo container model that this exec should act upon.
   * @param {Array} command - The command to execute inside the container.
   * @param {Object} options - An object containing options.
   * @param {Number} options.retries - The number of retries to attempt in the event of a unix socket error.
   * @param {Number} options.retryDelayMiliseconds - The number of seconds to delay between retries, defaults to 2000.
   * @param {Object} options.log - The number of seconds to delay between retries, defaults to 2000.
   * @param {Object} options.container - The probo container object to act upon.
   * @param {Boolean} options.tty - Whether to allocate a TTY for the running of this command, defaults to false.
   * NOTE: env doesn't seem to actually work in docker.
   * @param {Boolean} options.env - An array of environment variables to set when running this step, defaults to ['PWD=/src'].
   */
  constructor(container, command, options) {
    options = options || {};
    this[_exec] = null;
    // The number of retries to attempt in total.
    this.retries = options.retries || 3;
    // The number of retries we have attempted so far.
    this.attemptedRetries = 0;
    this.command = command;
    this[_stdoutStream] = through2();
    this[_stderrStream] = through2();
    this[_stdinStream] = through2();
    this.log = options.log || logger.getLogger();
    this.tty = options.tty || false;
    if (!container) {
      throw new Error('Container is required by ContainerExec');
    }
    this.container = container;
    this.tty = options.tty || false;
    // TODO: Allow env to be set in step initialization.
    // TODO: Does setting env work here?
    this.env = options.env || ['PWD=/src'];
  }

  get stdoutStream() {
    return this[_stdoutStream];
  }

  get stderrStream() {
    return this[_stderrStream];
  }

  get stdinStream() {
    return this[_stdinStream];
  }

  get exec() {
    return this[_exec];
  }

  set exec(exec) {
    this.addLogContext({execId: exec.Id});
    this[_exec] = exec;
  }

  set container(container) {
    this.addLogContext({containerId: container.containerId});
    this[_container] = container;
  }

  get container() {
    return this[_container];
  }

  addLogContext(context) {
    this.log = this.log.child(context);
  }

  // TODO: Return *this* now that we have getters and setters for stdIn, stdOut, and stdErr.
  run(done) {
    var self = this;
    self.create(function(error) {
      if (error) return self.errorHandler(error, done);
      self.start(function(error) {
        if (error) return self.errorHandler(error, done);
        self.inspect(done);
      });
    });
    return {
      stdIn: self.stdinStream,
      stdOut: self.stdoutStream,
      stdError: self.stderrStream,
    };
  }

  retryRun(error, done) {
    var self = this;
    if (self.attemptedRetries < self.retries) {
      var errorMessage = 'Maximum number of retries exceeded.';
      self.log.error(errorMessage);
      return done(new Error(errorMessage));
    }
    self.log.error('Got an EPIPE error, retrying in 2 sec...');
    setTimeout(function() {
      self.retries++;
      self.run(done);
    }, self.retryDelayMiliseconds);
  }

  errorHandler(error, message, done) {
    if (typeof message == 'function') {
      done = message;
      message = null;
    }
    this.log.error(error, message);
    if (done) {
      return done(error);
    }
  }

  create(done) {
    var self = this;
    self[_container].dockerContainer.exec(self.createOptions(), function(error, exec) {
      self.log.info('Exec created...');
      if (error) return self.errorHandler(error, done);
      self.exec = exec;
      if (error) {
        if (error.message === 'write EPIPE') return self.retryRun(error, done);
        return self.errorHandler(error, `${self.name}: Failed to exec command: ${error.message}`, done);
      }
      self.log.info(`container starting exec `);
      done();
    });
  }

  start(done) {
    var self = this;
    self.log.info('starting the exec');
    self.exec.start({stream: true, stdin: true, stdout: true}, function(error, stream) {
      if (error) return done(error);
      var decode = dockerDecoder.decode();
      decode.stdout.pipe(self.stdoutStream);
      decode.stderr.pipe(self.stderrStream);
      stream.pipe(decode);
      stream.on('end', done);
    });
  }

  inspect(done) {
    // Done is required, if done is not provide we will presume that this is an inspect
    // invocation invoked by node.js `util.inspect()` called by `console.log()`.
    if (!done) {
      return this;
    }
    var self = this;
    self.exec.inspect(function(error, data) {
      if (error) { return self.errorHandler(error, 'Failed to inspect exec', done); }

      self.exitCode = data.ExitCode;

      self.log.info(`exec ${self.exec.id.substr(0, 12)} on container ${self.container.containerId.substr(0, 12)} completed with ${self.exitCode}`);

      done(null, self);
    });
  }

  createOptions(options) {
    return {
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
      Tty: this.tty,
      Env: this.env,
      Cmd: this.command,
      Detach: false,
      OpenStdout: true,
    };
  }

}

module.exports = ContainerExec;
