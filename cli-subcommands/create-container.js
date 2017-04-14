/* eslint no-process-exit: 0*/
'use strict';

var fs = require('fs');
var yaml = require('js-yaml');
var request = require('request');
var Container = require('../lib/Container');
var stepPlugins = require('../lib/plugins/Step');
var Build = require('../lib/Build');
var StepList = stepPlugins.StepList;
var path = require('flavored-path');
var StepFactory = require('../lib/StepFactory');

var through2 = require('through2');

var exports = function() {
  this.configure = this.configure.bind(this);
  this.run = this.run.bind(this);
};

exports.shortDescription = 'Simple comand line interface to perform a build on a container.';

exports.config = function() {
};

exports.options = function(yargs) {
  return yargs
    .describe('asset-directory', 'The asset directory to mount.')
    .alias('asset-directory', 'a')
    .describe('source-directory', 'The asset directory to mount.')
    .alias('source-directory', 's')
    .describe('build-file', 'The .probo.yml file to build from.')
    .alias('build-file', 'b')
    .demand('build-file')
    .describe('interactive', 'Connect to this environment interactively after creating the container.')
    .alias('interactive', 'i')
  ;
};

exports.run = function(probo) {

  const config = probo.config;
  const jobConfig = yaml.safeLoad(fs.readFileSync(path.get(probo.config.buildFile)));

  const image = jobConfig.image || 'proboci/ubuntu-14.04-lamp';

  var containerOptions = {
    containerName: 'local-build-test-' + Date.now(),
    image,
    build: {id: 'stuff-' + Date.now()},
    imageConfig: {
      services: {
        cleanapache: {
          command: 'rm /var/run/apache2/apache2.pid',
        },
        apache: {
          command: '/usr/sbin/apache2ctl -D FOREGROUND',
          port: 80,
        },
      },
    },
    attachLogs: true,
  };
  if (config.assetDirectory) {
    // TODO: use a constant
    containerOptions.binds = [`${config.assetDirectory}:/assets`];
  }
  if (config.sourceDirectory) {
    // TODO: use a constant
    containerOptions.binds = [`${config.sourceDirectory}:/src`];
  }

  var container = new Container(containerOptions);
  var stepList = new StepList(container);
  var build = new Build({container, step: stepList});
  var stepFactory = new StepFactory({build, container, stepPlugins});
  let stepConfig = jobConfig.steps || [];
  for (let step of stepFactory.createStepsFromConfig(stepConfig)) {
    stepList.addStep(step);
  }
  stepList.stream.pipe(through2.obj(JSON.stringify)).pipe(process.stdout);
  build.stream.pipe(through2.obj(function(data, enc ,cb) {
    console.log(data);
    cb();
  }));

  container.create(function(error, data) {
    //if (error) logger.error('create error', error);
    build.run(function(error) {
      if (config.interactive) {
        var exec = container.exec(['bash'], {tty: true}, function(error, data) {
          if (error) {
            console.error(error);
            process.exit(1);
          }
        });
        process.stdin.pipe(exec.stdin);
        exec.stdout.pipe(process.stdout);
        exec.stderr.pipe(process.stderr);
      }
      console.log('RUNNING!');
    });
  });
};

function exitWithError(message) {
  console.error(message);
  process.exit(1);
}

module.exports = exports;
