var Docker = require('dockerode')
   ,through2 = require('through2')
   ,bunyan = require('bunyan')
;

/**
 * Constructor for the container model.
 */
var Container = function(options) {
  this.create = this.create.bind(this);
  this.docker = new Docker(options.docker);
  this.jobConfig = options.jobConfig;
  this.log = options.log || bunyan.createLogger({name: 'github-handler'});
  this.containerName = options.containerName || null;
  this.containerId = options.containerId || null;
  this.container = this.containerId ? this.docker.getContainer(this.containerId) : null;
  this.image = options.image;
  this.imageConfig = options.imageConfig;
  this.binds = options.binds || [];
  // Whether to attach to log output.
  this.attachLogs = options.attachLogs || false;
};

Container.prototype.runBuild = function(done) {
  var self = this;
  self.create(function(error, data) {
    if (error) return done(error);
    console.log('done');
    done(error, data);
    //self.runFetch(options);
  });
};

/**
 * Starts creates and starts this Docker container..
 *
 * The done callback will be called with errors (if one occured).
 */
Container.prototype.create = function(done) {
  var self = this;
  var docker = this.docker;

  console.log(self);
  var commandInfo = self.buildCommandInfo(self.imageConfig);

  var createOptions = {
    name: self.containerName,
    Image: self.image,
    ExposedPorts: commandInfo.exposedPorts,
    Cmd: commandInfo.command,
    Env: [
      // Without the PWD environment variable.
      'PWD=/'
    ],
  }
  var startOptions = {
    PortBindings:  commandInfo.portBindings,
    Binds: self.binds,
  };
  self.log.info('creating container');
  docker.createContainer(createOptions, function(error, container) {
    if (error) return done(error);
    self.id = container.id;
    self.container = container;
    if (error) return done(error);
    self.log.info('container created', { containerId: container.id });
    self.log.info('starting container.', { containerId: container.id });
    if (self.attachLogs) {
      container.attach({ stream: true, stdout: true, stderr: true }, function(error, stream) {
        container.modem.demuxStream(stream, self.createLogWriteStream(), self.createLogWriteStream());
      });
    }
    container.start(startOptions, function(error, data) {
      if (error) return done(error);
      container.inspect(function (error, data) {
        self.containerInfo = data;
        done(error, data);
      });
    });
  });
};

/**
 * Get the particular exposed port from container info.
 */
Container.prototype.getExposedPortFromContainerInfo = function(data, port) {
  if (!(data && data.NetworkSettings && data.NetworkSettings.Ports &&  data.NetworkSettings.Ports[port + '/tcp'][0].HostPort)) {
    return done(new Error('Could not find tcp port ' + port + ' on container ' + this.id));
  }
  return data.NetworkSettings.Ports[port + '/tcp'][0].HostPort;
};

/**
 * Build the command and port exposing logic for starting a penelope powered container.
 */
Container.prototype.buildCommandInfo = function(image) {
  var command = [ 'penelope' ];
  var name = null;
  // TODO: Accept argument for image to use.
  var exposedPorts = {};
  var portBindings = {};
  for (name in image.services) {
    var service = image.services[name];
    command.push('-n');
    command.push(name);
    command.push('-c');
    command.push(service.command);
    if (service.port) {
      var protocol = service.protocol || 'tcp';
      var portString = service.port + '/' + protocol;
      exposedPorts[portString] = {};
      portBindings[portString] = [{ HostPort: null }];
    }
  }
  return {
    command: command,
    exposedPorts: exposedPorts,
    portBindings: portBindings
  };
}

/**
 * Run a provisioner within a container.
 */
Container.prototype.runProvisioner = function(provisioner, done) {
  if (!this.provisionerPlugins[provisioner]) {
    done(new Error('Bad provisioner set.'));
  }
  this.provisionerPlugins[provisioner](this.jobConfig, done);

};

Container.prototype.provisionerPlugins = {};

/**
 * Runs a `drush fetch` inside a container.
 */
Container.prototype.provisionerPlugins.fetcher = function(options, done) {
  var self = this;
  var name = options.hostname || false;
  if (!name) return done(new Error('Site name is required'));
  var hostname = options.hostname || false;
  if (!hostname) return done(new Error('Hostname is required'));
  var remoteEnvironment = options.remoteEnvironment || dev;
  var localEnvironment = options.localEnvironment || proviso;
  var options = {
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
    Cmd: [
      'drush',
      'fetch',
      '--sql-sync',
      '-v',
      'inspired',
      '--hostname=' + hostname,
      '--remote-environment=' + remoteEnvironment,
      '--local-environment=' + localEnvironment,
    ],
  };
  container.exec(options, function(error, exec) {
    if (error) throw error;
    console.log('starting the exec');
    exec.resize({h: 56, w: 116}, function() {
      exec.start({stdin: true, stdout: true}, function(error, stream) {
        self.log('exec started');
        if (error) throw error;
        // TODO: How do we know when this is done?
        if (self.attachLogs) {
          stream.pipe(self.createLogWriteStream());
        }
      });
    });
  });
};

/**
 * Get a log handler stream appropriate to piping output to.
 */
Container.prototype.createLogWriteStream = function(options) {
  var stream = through2();
  //stream.pipe(process.stdout);
  return stream;
};

module.exports = Container;
