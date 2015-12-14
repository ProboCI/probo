'use strict';
var Docker = require('dockerode');
var through2 = require('through2');
var bunyan = require('bunyan');
var util = require('util');
var EventEmitter = require('events').EventEmitter;

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
 * @param {string} [options.assets.token] - API token for assets server.
 * @param {string} [options.attachLogs] - Whether to attach stdout and stderr from this container to this process.
 * @param {object} options.dockerConnectionInfo - The information on how to connect to the docker daemon.
 */
var Container = function(options) {
  options = options || {};
  this.docker = new Docker(options.dockerConnectionInfo);
  // TODO: We only use this for the $BUILD_ID environment variable.
  // Maybe we should do some more generic thing in setting environment variables
  // and letting the Steps create those environment variables?
  this.build = options.build;
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

/**
 * Creates and starts this Docker container.
 *
 * The done callback will be called with errors (if one occured).
 *
 * @param {function} done - The callback to call upon completion.
 */
Container.prototype.create = function(done) {
  this.emit('creating');
  done = wrapCallbackWithEmitter(this, 'created', done);

  var self = this;
  var docker = this.docker;

  var commandInfo = this.buildCommandInfo(self.image);
  var createOptions = this.buildCreateOptions();
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
};

Container.prototype.buildCreateOptions = function() {
  var self = this;
  var createOptions = {
    name: self.containerName,
    Image: self.image,
    ExposedPorts: commandInfo.exposedPorts,
    Cmd: commandInfo.command,
    Env: [
      `BUILD_ID=${this.build.id}`,
      // TODO: ASSET_DIR and SRC_DIR should be defined by the plugins most likely...
      `SRC_DIR=${SRC_DIR}`,
      `ASSET_DIR=${ASSET_DIR}`,
      `PWD=${SRC_DIR}`,
    ],
  };
  if (this.build.commit && this.build.commit.ref) {
    createOptions.Env.push(`COMMIT_REF=${this.build.commit.ref}`);
  }
  return createOptions;
}

/**
 * Returns the current status of the container
 *
 * @param {function} done - The callback to call when done.
 */
Container.prototype.getState = function(done) {
  this.inspect(function(error, info) {
    done(error, info.State);
  });
};

/**
 * Returns result of .inspect on container
 *
 * @param {function} done - The callback to call when done.
 */
Container.prototype.inspect = function(done) {
  if (typeof opts == 'function') {
    done = opts;
    opts = {};
  }
  this.container.inspect(opts, function(err, info) {
    return done(err, info);
  });
};

Container.prototype.stop = function(done) {
  this.emit('stopping');
  done = wrapCallbackWithEmitter(this, 'stopped', done);
  this.container.stop(done);
};

Container.prototype.restart = function(done) {
  this.emit('restarting');
  done = wrapCallbackWithEmitter(this, 'restarted', done);
  this.container.restart(done);
};

Container.prototype.start = function(done) {
  this.emit('starting');
  done = wrapCallbackWithEmitter(this, 'started', done);
};


/**
 * DELETE container from the filesystem
 */
Container.prototype.remove = function(opts, done) {
  this.emit('removing');

  if (typeof opts == 'function') {
    done = opts;
    opts = {};
  }

  done = wrapCallbackWithEmitter(this, 'removed', done);
  this.container.remove(opts, done);
};

/**
 * Get the particular exposed port from container info as returned from inspect.
 *
 * @param {Object} data - The object returned from a call to dockerode.container.inspect().
 * @param {Number} port - The port to locate.
 * @return The port.
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
Container.prototype.getDiskUsage = function(done) {
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
};

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
