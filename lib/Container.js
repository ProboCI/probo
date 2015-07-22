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
  this.log = options.log ? options.log.child({component: 'container'}) : bunyan.createLogger({name: 'container'});
  this.containerName = options.containerName || null;
  this.containerId = options.containerId || null;
  this.container = this.containerId ? this.docker.getContainer(this.containerId) : null;
  this.image = options.image;
  this.imageConfig = options.imageConfig;
  this.binds = options.binds || [];
  // Whether to attach to log output.
  this.attachLogs = options.attachLogs || false;
};

Container.prototype.runBuildSteps = Promise.promisify(function(done) {
  var self = this;
  var config = this.jobConfig;
  var tasks = [];

  var steps = config.steps || config.provisioner
  steps = Array.isArray(steps) ? steps : [steps]

  steps.forEach(function(step){
    var provisioner = step.provisioner
    provisioner.name = step.name
    var plugin = provisioner.plugin || 'Shell';

    if (provisioner && self.provisionerPlugins[plugin]) {
      var task = new self.provisionerPlugins[plugin](self, provisioner);
      tasks.push(task.run);
    }
  })

  // TODO: this currently runs all tasks at the same time because callbacks are called before commands finish
  //   need to call callbacks with promises, and chain the promises to actually run them one after the other
  async.series(tasks, done)
});


Container.prototype.runBuild = Promise.promisify(function(done) {
  var self = this;
  self.create(function(error, containerData) {
    if (error) return done(error);
    self.runBuildSteps(function(error, results) {
      done(error, results);
    });
  });
});

/**
 * Creates and starts this Docker container..
 *
 * The done callback will be called with errors (if one occured).
 */
Container.prototype.create = Promise.promisify(function(done) {
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
    self.log.info('starting container', { containerId: container.id });
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
});

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
