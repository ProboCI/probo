'use strict';
var bunyan = require('bunyan');
var through2 = require('through2');
var Resolver = require('multiple-callback-resolver');


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
    this.timeout = options.timeout || false;
    this.log = options.log || logger;
  }

  exec(command, options, done) {
    if (typeof options == 'function') {
      done = options;
      options = {};
    }
    var streams = {
      stdIn: through2(),
      stdOut: through2(),
      stdError: through2(),
    };
    setImmediate(this._simulateStream.bind(null, 'stdOut', streams.stdOut));
    setImmediate(this._simulateStream.bind(null, 'stdError', streams.stdError));
    var resolver = new Resolver();
    resolver.resolve(done);
    streams.stdOut.on('end', resolver.createCallback());
    streams.stdError.on('end', resolver.createCallback());
    return streams;
  }

  _simulateStream(name, stream) {
    for (let i = 1; i <= 10; i++) {
      stream.write(`${name}: data written ${i}\n`);
    }
    stream.end();
  }

  stop(done) {
    if (done) {
      done();
    }
  }
}

module.exports = Container;
