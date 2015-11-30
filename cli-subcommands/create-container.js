'use strict';

var fs = require('fs');
var yaml = require('js-yaml');
var request = require('request');
var Container = require('../lib/Container');

var exports = function() {
  this.configure = this.configure.bind(this);
  this.run = this.run.bind(this);
};

exports.shortDescription = 'Simple comand line interface to perform a build on a container.';

exports.config = function() {
};

exports.options = function(yargs) {
  return yargs
    .describe('build-file', 'The .probo.yml file to build from.')
    .alias('build-file', 'b')
    .demand('build-file')
    .describe('container-name', 'The name to give the docker container')
    .alias('container-name', 'n')
    .demand('container-name')
    .describe('container-manager-url', 'If specified, the running container manager URL to start the container from.')
    .alias('container-manager-url', 'u')
    .describe('commit-ref', 'The commit to in for use in build steps.')
    .alias('commit-ref', 'r')
    .describe('provider-slug', 'The identifying string used in this provider. With Github this would be `organization/repository`.')
    .alias('provider-slug', 'R')
    .demand('provider-slug')
    .describe('provider-type', 'The provider to fetch code from (defaults to `github`.')
    .default('provider-type', 'github')
    .describe('provider-api-token', 'The personal API token for the provider.')
    .alias('provider-api-token', 'A')
    .demand('provider-api-token')
  ;
};

exports.run = function(probo) {
  var config = probo.config;
  var jobConfig = yaml.safeLoad(fs.readFileSync(probo.config.buildFile));
  // Defaults should move into the CM.
  var image = jobConfig.image || config.image;
  var imageConfig = config.images[image];
  if (!imageConfig) return exitWithError('Invalid image ' + image + ' selected.');
  var options = {
    containerName: probo.config.containerName,
    docker: config.docker,
    imageConfig: imageConfig,
    config: jobConfig,
    // TODO: We seem to treat this differently in Container from ContainerManager.
    // This structure needs to be audited/cleaned up.
    jobConfig: jobConfig,
    binds: config.binds,
    attachLogs: true,
    build: {
      config: {
        image: image,
      },
    },
    project: {
      // TODO: What should we do about the expectation that we pass in project ID?
      id: 123,
      slug: config.providerSlug,
      provider: {
        type: config.providerType,
      },
      service_auth: {
        token: config.providerApiToken,
      },
    },
  };
  if (config.commitRef) {
    options.build.ref = config.commitRef;
  }
  if (config.containerManagerUrl) {
    var requestOptions = {
      method: 'post',
      uri: 'http://' + config.containerManagerUrl + '/startbuild',
      body: options,
      json: true,
    };
    console.log(requestOptions);
    request(requestOptions, function(error, response, body) {
      console.log(error, body);
    });
  }
  else {
    var container = new Container(options);
    container.runBuild()
      .then(function(data) {
        console.log('Created', data.Id);
      })
      .catch(function(error) {
        console.error('ERROR', error);
      });
  }
};

function exitWithError(message) {
  console.error(message);
  throw new Error('There was an error.');
}

module.exports = exports;
