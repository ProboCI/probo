var exports = function() {
  this.configure = this.configure.bind(this);
  this.run = this.run.bind(this);
};

var Docker = require('dockerode');

exports.shortDescription = 'TEMP Test container creation.'

exports.config = function() {
}

exports.run = function(amour) {
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
      //var protocol = service.protocol : service.protocol ? 'tcp';
      //var protocol = service.protocol || 'tcp';
      var protocol = 'tcp';
      var portString = service.port + '/' + protocol;
      exposedPorts[portString] = {};
      portBindings[portString] = [{ HostPort: null }];
    }
  }
  var ports = { "80/tcp": [{ "HostPort": "11022" }]};
  var volumes = [
    '/vagrant/ssh_credentials/id_rsa.pub:/root/.ssh/id_rsa.pub:ro',
    '/vagrant/ssh_credentials/id_rsa:/root/.ssh/id_rsa:ro',
  ];
  var createOptions = {
    Volumes: {
      '/root/.ssh/id_rsa': {},
      '/root/.ssh/id_rsa.pub': {},
    },
    Binds: [
      '/vagrant/ssh_credentials/id_rsa.pub:/root/.ssh/id_rsa.pub:ro',
      '/vagrant/ssh_credentials/id_rsa:/root/.ssh/id_rsa:ro',
    ],
    ExposedPorts: {"80/tcp":{}},
    PortBindings:  { "80/tcp": [{ "HostPort": null }]},
    Name: 'disco-stu'
  };
  docker.run('lepew/ubuntu-14.04-lamp:0.4', command, null, createOptions, createOptions, function(error, data, container) {
    console.log(arguments);
  });

  /*
  docker.createContainer({Image: 'lepew/ubuntu-14.04-lamp', Volumes: volumes, Ports: ports, Cmd: command, Name: 'disco-stu'}, function(err, cont) {
    cont.start(function (err, data) {
      console.log('start', arguments);
    });
    console.log('error', err, 'cont', cont);
      // container.start(function (err, data) {
      // });
  });
  // */
}

module.exports = exports;
