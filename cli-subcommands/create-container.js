var fs = require('fs')
   ,yaml = require('js-yaml')
   ,request = require('request')
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
    .describe('config', 'The .probo.yml file to build from.')
    .alias('image', 'i')
    .demand('config')
    .describe('container-name', 'The name to give the docker container')
    .alias('container-name', 'n')
    .demand('container-name')
    .describe('container-manager-url', 'If specified, the running container manager URL to start the container from.')
  ;
}

exports.run = function(probo) {
  var config = probo.config;
  var jobConfig = yaml.safeLoad(fs.readFileSync(probo.config.config));
  // Defaults should move into the CM.
  var image = jobConfig.image || config.image;
  var imageConfig = config.images[image];
  if (!imageConfig) return exitWithError('Invalid image ' + image + ' selected.');
  var options = {
    containerName: probo.config.containerName,
    docker: config.docker,
    image: image,
    build: {ref: "d65cf9baf3d14caeaa357471366e88cf"},
    imageConfig: imageConfig,
    jobConfig: jobConfig,
    binds: config.binds,
    attachLogs: true,
  };
  if (config.containerManagerUrl) {
    var requestOptions = {
      method: 'post',
      body: options,
      uri: 'http://' + config.containerManagerUrl,
      body: options,
      json: true,
    };
    request(requestOptions, function(error, response, body) {
      console.log(body);
    });
  }
  else {
    var container = new Container(options);
    container.runBuild(function(error, data) {
      if (error) {
        console.error('ERROR', error);
      }
      else {
        console.log('Created', data.Id);
      }
    });
  }
}

function exitWithError(message) {
  console.error(message);
  process.exit(1);
};

module.exports = exports;
