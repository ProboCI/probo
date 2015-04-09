var exports = function() {
  this.configure = this.configure.bind(this);
  this.run = this.run.bind(this);
};

var Docker = require('dockerode');
var fs = require('fs');

exports.shortDescription = 'TEMP Test container creation.'

exports.config = function() {
}

exports.options = function(yargs) {
  return yargs
    .describe('image', 'The image to run.')
    .alias('image', 'i')
    .describe('name', 'The name for the container.')
    .alias('name', 'n')
  ;
}

exports.run = function(amour) {

  var config = amour.config;

  var docker = new Docker();
  this.docker = docker;

  var command = [ 'penelope' ];
  var name = null;
  // TODO: Accept argument for image to use.
  var container = amour.config.images[amour.config.defaultImage];
  var exposedPorts = {};
  var portBindings = {};
  for (name in container.services) {
    var service = container.services[name];
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

  var createOptions = {
    name: config.name,
    Image: config.image,
    ExposedPorts: exposedPorts,
    Cmd: command,
    Env: [
      // Without the PWD environment variable some SSL libraries cannot find a key to load.
      'PWD=/'
    ],
  }
  var startOptions = {
    PortBindings:  portBindings,
    Binds: [
      '/vagrant/ssh_credentials/id_rsa.pub:/root/.ssh/id_rsa.pub:ro',
      '/vagrant/ssh_credentials/id_rsa:/root/.ssh/id_rsa:ro',
    ],
  };
  console.log('creating container.');
  docker.createContainer(createOptions, function(error, container) {
    if (error) throw error;
    console.log('starting containerainer.', container);
    container.start(startOptions, function (error, data) {
      if (error) throw error;
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
          '--remote-environment=dev',
          '--local-environment=proviso',
          // TODO: Come up with a way to set the hostname... build id?
        ],
      };
      console.log('running exec');
      container.exec(options, function(error, exec) {
        if (error) throw error;
        console.log('starting the exec');
        exec.resize({h: 56, w: 116}, function() { 
          exec.start({stdin: true, stdout: true}, function(error, stream) {
            console.log('exec started');
            if (error) throw error;
            stream.pipe(process.stdout);
            stream.pipe(fs.createWriteStream('build-' + Date.now() + '.log'));
          });
        });
      });
      /*
      container.attach({stream: true, stdout: true, stderr: true}, function (err, stream) {
        if (error) throw error;
        stream.pipe(process.stdout);
      });
      */
    });
  });
}

module.exports = exports;
