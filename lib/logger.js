'use strict';

const bunyan = require('bunyan');

class Logger {

  constructor() {
    this.logger = bunyan.createLogger({
      name: 'probo',
      level: 'debug',
      src: true,
      streams: [
        {
          stream: process.stdout,
        },
      ],
      serializers: bunyan.stdSerializers,
    });
  }

  set(logger) {
    this.logger = logger;
  }

  get(component) {
    if (component) {
      return this.logger.child({component: component});
    }
    else {
      return this.logger;
    }
  }
}

const logger = new Logger();

// Returns the public methods only.
module.exports = {
  set: logger.set.bind(logger),
  get: logger.get.bind(logger),
};
