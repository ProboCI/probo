var fs = require('fs')
   ,yaml = require('js-yaml')
   ,Container = require('../lib/Container')
   ,co = require('co')
;

var exports = function() {
  this.configure = this.configure.bind(this);
  this.run = this.run.bind(this);
};

exports.shortDescription = 'TEMP Test probo.yml configs execution in a container.'

exports.config = function() {}

exports.options = function(yargs) {
  return yargs
    .describe('config', 'The .probo.yml file to build from.')
    .alias('image', 'i')
    .demand('config')
    .describe('container-name', 'The name or (partial) id  of the existing running docker container to use')
    .alias('container-name', 'n')
    .demand('container-name')
  ;
}

exports.run = function(probo) {
  var config = probo.config;
  var jobConfig = yaml.safeLoad(fs.readFileSync(probo.config.config));
  var options = {
    docker: config.docker,
    containerName: probo.config.containerName,
    containerId: probo.config.containerName,
    jobConfig: jobConfig,
    attachLogs: true
  };

  co(function* (){
    var container = new Container(options);

    var results = yield container.runBuildSteps()
    // console.log('Executed', results);

  }).catch(function(err){console.error('ERROR', err.stack)})
}

module.exports = exports;
