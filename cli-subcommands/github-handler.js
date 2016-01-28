'use strict';

var GithubHandler = require('../lib/GithubHandler');

var exports = function() {
  this.configure = this.configure.bind(this);
  this.options = this.options.bind(this);
  this.run = this.run.bind(this);
  this.yargs = null;
};

var server = {};

exports.shortDescription = 'Runs a webhook handler and sends updates to github status API.';

exports.help = 'Useage: probo github-handler [args]';
exports.help += '\n';
exports.help += 'Provides a github webhook endpoint.';

exports.options = function(yargs) {
  this.yargs = yargs;
  return yargs
    .describe('port', 'The port on which to listen for incoming requests.')
    .alias('port', 'p')
    .describe('github-webhook-path', 'The path at which to listen for webhooks.')
    .alias('github-webhook-path', 'P')
    .describe('github-webhook-secret', 'The webhook secret provided to GitHub.')
    .alias('github-webhook-secret', 's')
    .describe('github-api-token', 'The API token to use to write to GitHub.')
    .alias('github-api-token', 'a')
  ;
};

exports.configure = function(config) {
  config = config;
  server = new GithubHandler(config);
};

exports.run = function(probo) {
  process.title = 'probo-ghh';
  server.start();
};

module.exports = exports;
