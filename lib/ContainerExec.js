'use strict';

var through2 = require('through2');
var logger = require('./logger');
// Note: we use this project because the demuxer in dockerode never closes child streams.
var dockerDecoder = require('docker-raw-stream');
var events = require('events');

// Symbols for use in the creation of private properties.
var _container = Symbol('_container');
var _exec = Symbol('_exec');
var _stdin = Symbol('_stdin');
var _stdout = Symbol('_stdout');
var _stderr = Symbol('_stderr');


class ContainerExec extends events.EventEmitter {

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
    super();
    options = options || {};
    this[_exec] = null;
    // The number of retries to attempt in total.
    this.retries = options.retries || 3;
    // The number of retries we have attempted so far.
    this.attemptedRetries = 0;
    this.command = command;
    this[_stdout] = through2();
    this[_stderr] = through2();
    this[_stdin] = through2();
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

  get stdout() {
    return this[_stdout];
  }

  get stderr() {
    return this[_stderr];
  }

  get stdin() {
    return this[_stdin];
  }

  set stdin(stream) {
    this[_stdin] = stream;
  }

  get exec() {
    return this[_exec];
  }

  get id() {
    if (this.exec) {
      return this.exec.Id;
    }
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

  run(done) {
    var self = this;
    self.create(function(error) {
      if (error) return self.errorHandler(error, done);
      self.start(function(error) {
        if (error) return self.errorHandler(error, done);
        self.inspect(done);
      });
    });
    return this;
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
      if (error) return self.errorHandler(error, done);
      self.exec = exec;
      self.log.debug(`Exec this.created...`);
      if (error) {
        if (error.message === 'write EPIPE') return self.retryRun(error, done);
        return self.errorHandler(error, `${self.name}: Failed to exec command: ${error.message}`, done);
      }
      done();
    });
  }

  start(done) {
    var self = this;
    self.log.debug('starting the exec');
    self.exec.start({stream: true, stdin: true, stdout: true}, function(error, stream) {
      self.log.info('exec running');
      if (error) return done(error);
      var decode = dockerDecoder.decode();

      decode.stdout.pipe(self.stdout);
      decode.stderr.pipe(self.stderr);
      stream.pipe(decode);
      stream.on('end', function() {
        self.emit('exited');
        done();
      });
      // There we pipe the through2 stream we create on startup into the stdin stream.
      self.stdin.pipe(stream, {end: false});
      self.emit('running');
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
