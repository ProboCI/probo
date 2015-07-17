var Docker = require('dockerode')
   ,through2 = require('through2')
   ,bunyan = require('bunyan')
   ,async = require('async')
   ,Promise = require('bluebird')
   ,TaskRunnerPlugins = require('./plugins/TaskRunner')
;

/**
 * Constructor for the container model.
 */
var Container = function(options) {
  this.create = this.create.bind(this);
  this.docker = new Docker(options.docker);
  this.jobConfig = options.jobConfig;
  this.log = options.log || bunyan.createLogger({name: 'container'});
  this.containerName = options.containerName || null;
  this.containerId = options.containerId || null;
  this.container = this.containerId ? this.docker.getContainer(this.containerId) : null;
  this.image = options.image;
  this.imageConfig = options.imageConfig;
  this.binds = options.binds || [];
  // Whether to attach to log output.
  this.attachLogs = options.attachLogs || false;
};

Container.prototype.runBuildSteps = function(done) {
  var self = this;
  var config = this.jobConfig;
  var tasks = [];
  var plugin = config.provisioner.plugin || 'Shell';

  if (config.provisioner && self.provisionerPlugins[plugin]) {
    var task = new self.provisionerPlugins[plugin](this, config.provisioner);
    tasks.push(task.run);
  }

  return Promise.promisify(async.series)(tasks)
    .then(function(result){ done && done(null, result); return result })
    .catch(function(err){ done && done(err); throw err })
};


Container.prototype.runBuild = function(done) {
  var self = this;
  self.create(function(error, containerData) {
    if (error) return done(error);
    self.runBuildSteps(function(error) {
      // TODO: Build some build data out?
      // TODO: Should we call done before this is finished?
      done(error, containerData);
    });
  });
};

/**
 * Creates and starts this Docker container..
 *
 * The done callback will be called with errors (if one occured).
 */
Container.prototype.create = function(done) {
  var self = this;
  var docker = this.docker;

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

Container.prototype.provisionerPlugins = TaskRunnerPlugins;

/**
 * Get a log handler stream appropriate to piping output to.
 */
Container.prototype.createLogWriteStream = function(options) {
  var stream = through2();
  stream.pipe(process.stdout);
  return stream;
};

module.exports = Container;
