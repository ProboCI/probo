'use strict';
var util = require('util');
var events = require('events');
var through2 = require('through2');
var Resolver = require('multiple-callback-resolver');

/**
 * A test fixture step class.
 *
 * @param {object} options - An options has for conifguring the class.
 * @param {object} options.fail - Whether to fail when run.
 * @param {object} options.id - The id for this build step.
 * @param {object} options.continueOnFailure - Whether to continue running the build if this task fails.
 */
var Step = function(options) {
  options = options || {};
  this.continueOnFailure = options.continueOnFailure || false;
  this.fail = options.fail || null;
  // TODO: Random self assignment
  this.id = options.id || null;
  this.run = this.run.bind(this);
  this.getStream = this.getStream.bind(this);
  this.stdOutStream = through2();
  this.stdErrStream = through2();
  this.stream = through2.obj();
  this._attachStreams();
  this.state = 'pending';
  events.EventEmitter.call(this);
};
util.inherits(Step, events.EventEmitter);

Step.prototype._attachStreams = function() {
  var self = this;
  var callbacks = Resolver.resolver(2, {nonError: true}, function() {
    self.stream.end();
  });
  this.stdOutStream
    .pipe(self.multiplexStream('stdout', callbacks[0]))
    .pipe(self.stream, {end: false});
  this.stdErrStream
    .pipe(self.multiplexStream('stderr', callbacks[1]))
    .pipe(self.stream, {end: false});
};

Step.prototype.getState = function() {
  return this.state;
};

Step.prototype.multiplexStream = function(stream, done) {
  var self = this;
  return through2.obj(function(data, enc, cb) {
    this.push({
      stream,
      data,
      stepId: self.id,
    });
    cb();
  }, done);
};

Step.prototype.getStream = function() {
  return this.stream;
};

Step.prototype.run = function(done) {
  var error = null;
  this.state = 'running';
  this.emit('start');
  this.stdOutStream.write('stdout input line 1');
  this.stdErrStream.write('stderr input line 1');
  this.stdOutStream.write('stdout input line 2');
  this.stdErrStream.write('stderr input line 2');
  this.stdOutStream.end();
  this.stdErrStream.end();
  this.emit('end');
  this.state = 'completed';
  if (this.fail) {
    this.state = 'errored';
    error = new Error('Task failed');
  }
  done(error);
};

module.exports = Step;
