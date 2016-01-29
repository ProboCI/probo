'use strict';

var logger = require('./lib/logger').getLogger();
var through2 = require('through2');
through2();

var lib = require('.');
var Container = lib.Container;
var Build = lib.Build;
var StepList = lib.plugins.Step.StepList;
var Script = lib.plugins.Step.Script;


// TODO: Simplify this necessary config?
var containerOptions = {
  // Name should be optional - also it shouldn't be containerName camel case like that.
  containerName: 'local-build-test-' + Date.now(),
  // Ok, we really need this.
  image: 'proboci/ubuntu-14.04-lamp',
  // This should be self assigned if necessary.
  build: {id: 'stuff-' + Date.now()},
  // This is how we do our definitions of the command to run, should this be baked
  // right into the image config though?
  imageConfig: {
    services: {
      cleanapache: {
        command: 'rm /var/run/apache2/apache2.pid',
      },
      apache: {
        command: '/usr/sbin/apache2ctl -D FOREGROUND',
        port: 80,
      },
      mysql: {
        command: 'mysqld_safe',
      },
    },
  },
  attachLogs: true,
};

var container = new Container(containerOptions);
var build = new Build();
build.container = container;

function getTestScript(stepName) {
  var stepOptions = {
    name: stepName,
    script: [],
    timeout: false,
  };
  for (let i = 1; i < 2; i++) {
    stepOptions.script.push(`echo "stdout for ${stepName} line ${i}"`);
    stepOptions.script.push('sleep 2');
  }
  return new Script(container, stepOptions);
}

function getStepList(listName) {
  var stepList = new StepList(container, {id: listName, timeout: false});
  return stepList;
}

var buildStep = getStepList('buildStep 🐝  ');
build.step = buildStep;
build.step.addStep(getTestScript('top script'));
var nestedStep = getStepList('build child 🐙   ');
nestedStep.addStep(getTestScript('octopus script'));
build.step.addStep(nestedStep);
var doubleNestedStep = getStepList('build child child 🐙 🐙 ');
doubleNestedStep.addStep(getTestScript('child of the octopus script'));
nestedStep.addStep(doubleNestedStep);
//stepList.addStep(getShit('nested'));


container.create(function(error, data) {
  if (error) logger.error('create error', error);
  build.run(function(error) {
    if (error) logger.error('*build process run error', error);
    // /*
    container.remove(function() {
      if (error) console.log('remove error', error);
      logger.info({containerId: container.containerId}, `run complete, container cleaned up: ${container.containerId}`);
    });
    // */
  });
});



build.jsonStream.pipe(getCountStream('json text stream'));
build.stream.pipe(getCountStream('object stream'));
build.step.stream.pipe(getCountStream('actual step stream'));

// build.jsonStream.pipe(process.stderr);

// /*
build.stream
  .pipe(through2.obj(function(data, enc, cb) {
    logger.info('Command output: ' + data.data);
    cb(null, data);
  }, function() {
    logger.warn('THIS IS WHERE THE STREAM ENDS');
  }));
//  */
//
function getCountStream(title) {
  var name = '☀️  ' + title;
  var count = 0;
  return through2.obj(function(data, enc, cb) {
    count++;
    cb(null, data);
  }, function() {
    logger.error(`${name} total: ${count}`);
  });
}
