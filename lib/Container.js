'use strict';
var Docker = require('dockerode');
var through2 = require('through2');
var bunyan = require('bunyan');
var Promise = require('bluebird');
var util = require('util');
var EventEmitter = require('events').EventEmitter;

var TaskRunnerPlugins = require('./plugins/TaskRunner');
var AssetDownloader = require('./plugins/TaskRunner/AssetDownloader');

// patch dockerode's container.inspect to take opts
require('./_patchDockerodeInspect');

const ASSET_DIR = '/assets';
const SRC_DIR = '/src';


/**
 * Constructor for the container model.
 * @class
 *
 * @param {object} options - An options hash.
 * @param {object} options.assets - Assets server configuration for AssetDownloader.
 * @param {string} options.assets.url - Assets server URL.
 * @param {string} [options.assets.token] - API token for assets server.
 */
var Container = function(options) {
  this.create = this.create.bind(this);
  this.docker = new Docker(options.docker);
  this.build = options.build;
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
  this.assetsOpts = options.assets;
  this.authUrl = options.authUrl;

  EventEmitter.call(this);

  // wrap emit method to also emit a generic event
  var _emit = this.emit;
  this.emit = function(event) {
    var args = Array.prototype.slice.call(arguments);

    // emit original event
    _emit.apply(this, args);

    // emit a "stateChange" event
    args.unshift('stateChange');
    _emit.apply(this, args);
  };
};
util.inherits(Container, EventEmitter);

Container.prototype.buildSetupTasks = Promise.promisify(function(done) {
  var jobConfig = this.jobConfig;

  var container = this;
  var build = this.build;
  var project = build.project;

  var tasks = [];

  // 1. Download the code
  var downloadSource = this._createDownloader(build, project);
  tasks.push(downloadSource);

  // 2. Download the assets
  if (jobConfig.assets && this.assetsOpts) {
    this.assetsOpts.bucket = (project.assets && project.assets.bucket) || project.id;
    this.assetsOpts.assets = jobConfig.assets;
    var ad = new AssetDownloader(container, this.assetsOpts);
    tasks.push(ad);
  }

  done(null, tasks);
});

Container.prototype._createDownloader = function(build, project) {
  // map provider type to downloader class name
  var downloaders = {
    github: 'GithubDownloader',
    stash: 'StashDownloader',
    bitbucket: 'BitbucketDownloader',
  };

  var providerType = project.provider.type;
  var plugin = downloaders[providerType];
  if (!plugin) {
    throw new Error('Download: unsupported provider type: ' + providerType);
  }

  // dynamically require and instantiate a downloder
  var Downloader;
  try {
    Downloader = require(`./plugins/TaskRunner/${plugin}`);
  }
  catch (e) {
    var msg = `Download: failed to load supported downloader for provider ${providerType}: ${e.message}`;
    this.log.error({err: e, plugin}, msg);
    throw new Error(msg);
  }

  return new Downloader(this, {build, project, auth_lookup_url: this.authUrl});
};

Container.prototype.buildUserTasks = Promise.promisify(function(done) {
  var self = this;
  var config = this.jobConfig;
  var tasks = [];
  var steps = config.steps || [];
  steps = Array.isArray(steps) ? steps : [steps];

  steps.forEach(function(step) {
    var plugin = step.plugin || 'Shell';

    if (self.provisionerPlugins[plugin]) {
      var task = new self.provisionerPlugins[plugin](self, step);
      tasks.push(task);
    }
  });

  done(null, tasks);
});

/**
 * First class Promise method.
 *
 * helper method to run scripts, not
 * useful in an app because it doesn't pass up stream before its piped
 * out
 *
 * @return {booelean} - The status of the tasks.
 */
Container.prototype.runTasks = function() {
  this.emit('running tasks');

  var self = this;
  return this.buildUserTasks().each(function(task) {
    return task.run().then(function(result) {
      // result: {stream, exec (Promise), task}
      result.streams.combined.pipe(process.stdout);
      return result.exec.then(function(exec) {
        console.log('Exit code:', exec.ExitCode);

        self.emit('tasks complete', result);
        return result;
      });
    });
  });
};

Container.prototype.runBuild = Promise.promisify(function(done) {
  var self = this;
  self.create(function(error, containerData) {
    if (error) return done(error);

    return self.runTasks().then(function(EvaluatedTasks) {
      return containerData;
    }).nodeify(done);
  });
});

/**
 * Creates and starts this Docker container.
 *
 * The done callback will be called with errors (if one occured).
 */
Container.prototype.create = Promise.promisify(function(done) {
  this.emit('creating');
  done = wrapCallbackWithEmitter(this, 'created', done);

  var self = this;
  var docker = this.docker;

  var commandInfo = self.buildCommandInfo(self.imageConfig);

  var createOptions = {
    name: self.containerName,
    Image: self.image,
    ExposedPorts: commandInfo.exposedPorts,
    Cmd: commandInfo.command,
    Env: [
      `COMMIT_REF=${this.build.commit.ref}`,
      `BUILD_ID=${this.build.id}`,
      `SRC_DIR=${SRC_DIR}`,
      `ASSET_DIR=${ASSET_DIR}`,
      `PWD=${SRC_DIR}`,
    ],
  };
  var startOptions = {
    PortBindings: commandInfo.portBindings,
    Binds: self.binds,
  };
  self.log.info('creating container');
  docker.createContainer(createOptions, function(error, container) {
    if (error) return done(error);
    self.id = container.id;
    self.container = container;
    if (error) return done(error);
    self.log.info('container created', {containerId: container.id});
    self.log.info('starting container', {containerId: container.id});
    if (self.attachLogs) {
      container.attach({stream: true, stdout: true, stderr: true}, function(error, stream) {
        // TODO: We should consider collecting log output from the node and
        // sending it to loom.
        container.modem.demuxStream(stream, self.createLogWriteStream(), self.createLogWriteStream());
      });
    }
    container.start(startOptions, function(error, data) {
      if (error) return done(error);
      container.inspect(function(error, data) {
        self.containerInfo = data;
        done(error, data);
      });
    });
  });
});

/**
 * Tries to create a container or finds one by the ID instead
 */
Container.prototype.findOrCreate = function() {

};

/**
 * Returns the current status of the container
 */
Container.prototype.getState = function(done) {
  return this.inspect()
    .then(function(info) { return info.State; })
    .asCallback(done);
};

/**
 * Returns result of .inspect on container
 */
Container.prototype.inspect = Promise.promisify(function(opts, done) {
  if (typeof opts == 'function') {
    done = opts;
    opts = {};
  }
  this.container.inspect(opts, function(err, info) {
    return done(err, info);
  });
});

/**
 * Stop the container
 */
Container.prototype.stop = Promise.promisify(function(done) {
  this.emit('stopping');
  done = wrapCallbackWithEmitter(this, 'stopped', done);
  this.container.stop(done);
});

/**
 * restart (stop/start) container
 */
Container.prototype.restart = Promise.promisify(function(done) {
  this.emit('restarting');
  done = wrapCallbackWithEmitter(this, 'restarted', done);
  this.container.restart(done);
});

/**
 * start container
 */
Container.prototype.start = Promise.promisify(function(done) {
  this.emit('starting');
  done = wrapCallbackWithEmitter(this, 'started', done);
  this.container.start(done);
});


/**
 * DELETE container from the filesystem
 */
Container.prototype.remove = Promise.promisify(function(opts, done) {
  this.emit('removing');

  if (typeof opts == 'function') {
    done = opts;
    opts = {};
  }

  done = wrapCallbackWithEmitter(this, 'removed', done);
  this.container.remove(opts, done);
});

/**
 * Get the particular exposed port from container info.
 */
Container.prototype.getExposedPortFromContainerInfo = function(data, port) {
  try {
    return data.NetworkSettings.Ports[port + '/tcp'][0].HostPort;
  }
  catch (e) {
    throw new Error('Could not find tcp port ' + port + ' on container ' + this.id);
  }
};

/**
 * Gets the disk usage of the container.
 * Current implementation requires the AUFS Storage driver and to be run as root.
 * Errors if there's no root access or not using the AUFS driver
 *
 * @param {Function} done - callback that takes err and an object as arguments. The object has {imageSize, containerSize}, for the size of the inderlying image and container layer respectively
 */
Container.prototype.getDiskUsage = Promise.promisify(function(done) {
  var result = {containerSize: undefined, imageSize: undefined};

  // stat the container to ensure that it's using the AUFS driver
  this.container.inspect({size: true}, function(err, info) {
    if (err) {
      return done(null, result);
    }

    result.containerSize = (info.SizeRw || null);
    result.imageSize = (info.SizeRootFs || null);
    done(null, result);
  });
});

/**
 * Build the command and port exposing logic for starting a penelope powered container.
 *
 * @param {string} image - The name of the image we are extracting build command info for.
 * @return {object} - The command info on what is to be run.
 */
Container.prototype.buildCommandInfo = function(image) {
  var command = ['penelope'];
  var exposedPorts = {};
  var portBindings = {};
  for (let name in image.services) {
    if (image.services.hasOwnProperty(name)) {
      var service = image.services[name];
      command.push('-n');
      command.push(name);
      command.push('-c');
      command.push(service.command);
      if (service.port) {
        var protocol = service.protocol || 'tcp';
        var portString = service.port + '/' + protocol;
        exposedPorts[portString] = {};
        portBindings[portString] = [{HostPort: null}];
      }
    }
  }
  return {
    command: command,
    exposedPorts: exposedPorts,
    portBindings: portBindings,
  };
};

Container.prototype.provisionerPlugins = TaskRunnerPlugins;

/**
 * Get a log handler stream appropriate to piping output to.
 *
 * @param {object} options Options to pass to for the creation of the log stream.
 * @return {stream} - The stream to write log files to.
 */
Container.prototype.createLogWriteStream = function(options) {
  var stream = through2();
  stream.pipe(process.stdout);
  return stream;
};

function wrapCallbackWithEmitter(emitter, eventName, callback) {
  return function() {
    var args = Array.prototype.slice.call(arguments);
    args.unshift(eventName);
    emitter.emit.apply(emitter, args);
    callback.apply(emitter, arguments);
  };
}

module.exports = Container;
