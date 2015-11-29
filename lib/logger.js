var bunyan, logger;

bunyan = require('bunyan');

logger = bunyan.createLogger({
  name: 'probo',
  level: 'debug',
  src: true,
  streams: [
    {
      stream: process.stdout
    }
  ],
  serializers: bunyan.stdSerializers
});

module.exports = {
  getLogger: function(component) {
    if (component) {
      return logger.child({component: component});
    }
    else {
      return logger;
    }
  }
};
