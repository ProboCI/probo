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
  var jobConfig = yaml.safeLoad(fs.readFileSync(amour.config.config));
  var container = new Container(amour.config, jobConfig);
  container.runBuild();
}

module.exports = exports;
