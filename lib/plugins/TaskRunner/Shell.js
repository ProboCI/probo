var parse = require('shell-quote').parse;

var Shell = function(container, options) {
  this.options = options || {};
  this.container = container;
  this.timeout = options.timeout || 6000
  this.name = options.name || "Shell"
  this.run = this.run.bind(this);
};

/**
 * Perform any necessary necessary
 */
Shell.prototype.buildOptions = function() {
  var options = this.options || {};
  options.tty = options.tty || false;
  options.env = options.env || [
    'PWD=/',
  ];
  var self = this;
  //command = parse(options.command);
  //command.unshift('sh');
  return {
    Detach: false,
    stout: true,
    OpenStdout: true,
    AttachStdin: true,
    AttachStdout: true,
    AttachStderr: true,
    Tty: options.tty,
    // SSH errors were observed without having a PWD set.
    Env: options.env,
    Cmd: [ 'bash', '-c', options.command ],
  };
};

Shell.prototype.handleTimeout = function() {
};

/**
 * Returns a function that kicks off Shell.run when invoked and returns a promise
 */
Shell.prototype.queue = function() {
  return Promise.promisify(this.run.bind(this))
}

// The log write stream needs to be handed in from the
// outside because that will be configured at the container level.
Shell.prototype.run = function(done) {
  // TODO: This is bad - I should call this dockerContainer or something...
  var log = this.container.log.child({component: 'Shell'});
  var container = this.container.container;
  var self = this;

  // TODO: We'll need a timeout.
  container.exec(self.buildOptions(), function(error, exec) {
    log.info('starting the exec');

    self.exec = exec;
    if(error) {
      return done(new Error("Failed to exec command: " + error.message));
    }

    exec.start({stdin: true, stdout: true}, function(error, stream) {
      log.info('exec started');
      if(error) {
        return done(new Error("Failed to start command: " + error.message));
      }

      // TODO: Allow a write stream to be connected here.

      var finished = new Promise(function(resolve, reject){
        stream.on('end', function() {
          log.info('exec stream ended');

          exec.inspect(function(error, data) {
            if(error){ return reject(error) }

            log.info('exec completed with', data.ExitCode);

            resolve(data)
          });
        });
      })

      done(null, {stream, exec: finished, provisioner: self})
    });
  });
};

module.exports = Shell;
