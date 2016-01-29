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

function getShit(item) {
  var stepOptions1 = {
    name: `${item} First Step`,
    script: [],
    secrets: [
      'fuck',
    ],
    timeout: false,
  };
  for (let i = 1; i < 7; i++) {
    stepOptions1.script.push(`echo "fuck is a bad word - ${item} - ${i}"`);
    // stepOptions1.script.push('sleep 1');
  }
  var stepOptions2 = {
    name: `${item} Second Step`,
    script: [],
    timeout: false,
  };
  for (let i = 1; i < 7; i++) {
    stepOptions2.script.push(`echo "hell is a bad word - ${item} - ${i}"`);
    // stepOptions2.script.push('sleep 1');
  }
  var stepList = new StepList(container, {timeout: false, name: '🎩 top list'});
  build.step = stepList;
  stepList.addStep(new Script(container, stepOptions1));

  //stepList.addStep(new Script(container, stepOptions2));
  return stepList;
}

var stepList = getShit('top level');
stepList.addStep(getShit('nested'));
build.step = stepList;


container.create(function(error, data) {
  if (error) logger.error('create error', error);
  build.run(function(error) {
    if (error) logger.error('*build process run error', error);
    container.remove(function() {
      if (error) console.log('remove error', error);
      logger.info({containerId: container.containerId}, `run complete, container cleaned up: ${container.containerId}`);
    });
    // */
  });
});

var countup = function(title) {
  var name = title;
  var count = 0;
  return through2.obj(function(data, enc, cb) {
    count++;
    console.log(count);
    cb(null, data);
  }, function() {
    logger.error(`${name} total: ${count}`);
  });
};

build.jsonStream.pipe(countup('text stream'));
build.stream.pipe(countup('object stream'));

// build.jsonStream.pipe(process.stderr);

 /*
build.stream
  .pipe(through2.obj(function(data, enc, cb) {
    logger.info('Command output: ' + data.data);
    cb(null, data);
  }, function() {
    logger.error('THIS IS WHERE THE STREAM ENDS');
  }));
//  */
