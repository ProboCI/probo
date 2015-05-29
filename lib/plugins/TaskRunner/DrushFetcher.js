var DrushFetcher = function(container, options) {
  this.options = options || {};
  this.container = container;
  this.timeout = options.timeout || 6000
  this.buildOptions = this.buildOptions.bind(this);
  this.run = this.run.bind(this);
};

/**
 * Perform any necessary necessary 
 */
DrushFetcher.prototype.buildOptions = function() {
  var options = this.options;
  var command = [
    'drush',
    'fetch',
    '--sql-sync',
    '--verbose',
    options.name,
  ];
  var param = null;
  for (param in options.params) {
    command.push('--' + param + '=' + options.params[param]);
  }
  if (options.config) {
    command.push('--json-config=' + JSON.stringify(this.options.config));
  }
  return {
    Detach: false,
    Tty: false,
    stout: true,
    OpenStdout: true,
    AttachStdin: true,
    AttachStdout: true,
    AttachStderr: true,
    // SSH errors were observed without having a PWD set.
    Env: [
      'PWD=/',
    ],
    Cmd: command,
  };
};

DrushFetcher.prototype.handleTimeout = function() {
};

// The log write stream needs to be handed in from the
// outside because that will be configured at the container level.
DrushFetcher.prototype.run = function(done) {
  // TODO: We'll need a timeout.
  // TODO: Move this into its own folder.
  var self = this;
  var log = this.container.log;
  var container = this.container.container;
  log.info('options', self.buildOptions());
  container.exec(self.buildOptions(), function(error, exec) {
    this.exec = exec;
    if (error) throw error;
    log.info('starting the exec');
      exec.start({stdin: true, stdout: true}, function(error, stream) {
        log.info('exec started');
        if (error) throw error;
        stream.pipe(process.stdout);
        stream.on('end', function() {
          log.info('container ended');
          exec.inspect(done);
        });
      });
  });
};

module.exports = DrushFetcher;
