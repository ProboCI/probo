var util = require('util')
var events = require('events')
var through2 = require('through2')

/**
 * A test fixture step class.
 */
var Step = function() {
  var self = this
  self.run = self.run.bind(self)
  self.getStream = self.getStream.bind(self)
  self.stdOutStream = through2()
  self.stdErrStream = through2()
  self.stream = through2.obj()
  self._attachStreams()
  events.EventEmitter.call(self)
}
util.inherits(Step, events.EventEmitter)

Step.prototype._attachStreams = function() {
  var callbacks = this.resolver(2, function() {
    this.stream.end() 
  })
  this.stdOutStream
    .pipe(this.multiplexStream('stdout', callbacks[0]))
    .pipe(this.stream, { end: false })
  this.stdErrStream
    .pipe(this.multiplexStream('stderr', callbacks[1]))
    .pipe(this.stream, { end: false })
}

Step.prototype.multiplexStream = function(stream, done) {
  return through2.obj(function(data, enc, cb) {
    this.push({
      stream,
      data,
    })
    cb()
  }, done)
}

// TODO: Rename the resolver, maybe move it into its own library
// TODO: Add ability to call done with an error if any callback was called with an error
// TODO: Add ability to return the data passed to the callback if any data was passed to the callback
Step.prototype.resolver = function resolver(callbackNumber, done) {
  var callbacks = []
  var results = []
  var calledCallbacks = 0
  for (var i = 0 ; i < callbackNumber ; i++) {
    callbacks.push(function() {
      results.push(arguments)
      calledCallbacks++
      if (calledCallbacks == callbackNumber) {
        done(null, results)
      }
    });
  }
  return callbacks
}

Step.prototype.getStream = function() {
  return this.stream
}

Step.prototype.run = function(cb) {
  this.emit('start')
  this.stdOutStream.write('stdout input line 1')
  this.stdErrStream.write('stderr input line 1')
  this.stdOutStream.write('stdout input line 2')
  this.stdErrStream.write('stderr input line 2')
  this.stdOutStream.end()
  this.stdErrStream.end()
  this.emit('end')
  cb()
}

module.exports = Step
