var util = require('util')
var events = require('events')
var through2 = require('through2')

/**
 * A test fixture step class.
 */
var Step = function() {
  this.run = this.run.bind(this)
  this.getStream = this.getStream.bind(this)
  // TODO: Deal with multiplexing
  this.stream = through2()
  events.EventEmitter.call(this)
}
util.inherits(Step, events.EventEmitter)

Step.prototype.getStream = function() {
  return this.stream
}

Step.prototype.run = function(cb) {
  this.emit('start')
  this.stream.write('input line 1')
  this.stream.write('input line 2')
  this.stream.end()
  this.emit('end')
  cb()
}

module.exports = Step
