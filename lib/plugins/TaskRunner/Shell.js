var parse = require('shell-quote').parse;

var Shell = function(container, options) {
  this.options = options || {};
  this.container = container;
  this.timeout = options.timeout || 6000
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

// The log write stream needs to be handed in from the
// outside because that will be configured at the container level.
Shell.prototype.run = function(done) {
  // TODO: This is bad - I should call this dockerContainer or something...
  var log = this.container.log;
  var container = this.container.container;
  var self = this;
  // TODO: We'll need a timeout.
  container.exec(self.buildOptions(), function(error, exec) {
    this.exec = exec;
    if (error) throw error;
    log.info('starting the exec');
      exec.start({stdin: true, stdout: true}, function(error, stream) {
        log.info('exec started');
        if (error) throw error;
        // TODO: Allow a write stream to be connected here.
        stream.pipe(process.stdout);
        stream.on('end', function() {
          log.info('exec stream ended');
          exec.inspect(function(error, data) {
            log.info('exec completed with', data.ExitCode);
            // TODO: Figure out the best way to report an error if exit code was != 0?
            done(error, data);
          });
        });
      });
  });
};

module.exports = Shell;
