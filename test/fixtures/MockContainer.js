'use strict';
var events = require('events');
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
    this.execOutput = options.execOutput || false;
  }

  exec(command, options, done) {
    if (typeof options == 'function') {
      done = options;
      options = {};
    }
    var streams = new events.EventEmitter();
    streams.stdin = through2();
    streams.stdout = through2();
    streams.stderr = through2();
    setImmediate(this._simulateStream.bind(this, 'stdOut', streams.stdout));
    setImmediate(this._simulateStream.bind(this, 'stdError', streams.stderr));
    var resolver = new Resolver();
    resolver.resolve(done);
    streams.stdout.on('end', resolver.createCallback());
    streams.stderr.on('end', resolver.createCallback());
    return streams;
  }

  _simulateStream(name, stream) {
    if (this.execOutput) {
      for (let line of this.execOutput) {
        stream.write(`${line}\n`);
      }
    }
    else {
      for (let i = 1; i <= 10; i++) {
        stream.write(`${name}: data written ${i}\n`);
      }
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
