'use strict';
var bunyan = require('bunyan');

var logger = bunyan.createLogger({
  name: 'probo',
  level: Number.POSITIVE_INFINITY,
  src: true,
  streams: [
    {
      stream: process.stdout,
    },
  ],
});

class Container {
  constructor(options) {
    options = options || {};
    this.log = options.log || logger;
  }

  stop(done) {
    done();
  }
}

module.exports = Container;
