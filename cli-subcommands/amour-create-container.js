var fs = require('fs')
   ,yaml = require('js-yaml')
   ,Container = require('../lib/Container')
;

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
    .describe('config', 'The .proviso.yml file to build from.')
    .alias('image', 'i')
    .demand('config')
    .describe('container-name', 'The name to give the docker container')
    .alias('container-name', 'n')
    .demand('container-name')
  ;
}

exports.run = function(amour) {
  var config = amour.config;
  var jobConfig = yaml.safeLoad(fs.readFileSync(amour.config.config));
  var image = jobConfig.image || config.image;
  var imageConfig = config.images[image];
  if (!imageConfig) return exitWithError('Invalid image ' + image + ' selected.');
  var options = {
    containerName: amour.config.containerName,
    docker: config.docker,
    image: image,
    imageConfig: imageConfig,
    jobConfig: jobConfig,
    binds: [
      '/vagrant/ssh_credentials/id_rsa.pub:/root/.ssh/id_rsa.pub:ro',
      '/vagrant/ssh_credentials/id_rsa:/root/.ssh/id_rsa:ro',
    ],
  };
  var container = new Container(options);
  container.runBuild(function(error, data) {
    console.log(arguments);
  });
}

function exitWithError(message) {
  console.error(message);
  process.exit(1);
};

module.exports = exports;
