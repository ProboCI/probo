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
 */
var Step = function(options) {
  options = options || {};
  var self = this;
  // TODO: Random self assignment
  self.id = options.id || null;
  self.run = self.run.bind(self);
  self.getStream = self.getStream.bind(self);
  self.stdOutStream = through2();
  self.stdErrStream = through2();
  self.stream = through2.obj();
  self._attachStreams();
  events.EventEmitter.call(self);
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

Step.prototype.run = function(cb) {
  this.emit('start');
  this.stdOutStream.write('stdout input line 1');
  this.stdErrStream.write('stderr input line 1');
  this.stdOutStream.write('stdout input line 2');
  this.stdErrStream.write('stderr input line 2');
  this.stdOutStream.end();
  this.stdErrStream.end();
  this.emit('end');
  cb();
};

module.exports = Step;
