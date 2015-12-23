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
    var callbacks = Resolver.resolver(2, done);
    streams.stdOut.on('end', callbacks[0]);
    streams.stdError.on('end', callbacks[1]);
    return streams;
  }

  _simulateStream(name, stream) {
    for (let i = 1; i <= 10; i++) {
      stream.write(`${name}: data written ${i}\n`);
    }
    stream.end();
  }

  stop(done) {
    done();
  }
}

module.exports = Container;
