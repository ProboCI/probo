'use strict';

var bunyan;
var logger;

bunyan = require('bunyan');

logger = bunyan.createLogger({
  name: 'probo',
  // TODO: MAke the log level configurable.
  level: 'debug',
  src: true,
  streams: [
    {
      stream: process.stdout,
    },
  ],
  serializers: bunyan.stdSerializers,
});

module.exports = {
  getLogger: function(component) {
    if (component) {
      return logger.child({component: component});
    }
    else {
      return logger;
    }
  },
};
