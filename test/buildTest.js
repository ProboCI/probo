var through2 = require('through2')

var lib = require('..')
var Build = lib.Build
var Container = lib.Container
var Step = require('./fixtures/TaskPlugin')

/**
 * @param {string} name - The name of the event to emit.
 * @param {mixed} data - The data payload to include, usually an object.
 */
Step.prototype.emitEvent = function(name, data) {
  this.emit(name, data);
  this.emit('change', data);
};

/**
 * Create an array of callbacks and call done only once all have been resolved.
 *
 * @param {integer} callbackNumber - The number of callbacks to produce and require.
 * @param {function} done - The callback to call once all 
 * @returns {Array} - An array of functions to be bound to callbacks.
 */
function resolver(callbackNumber, done) {
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

describe('Build', function() {
  it('should emit the appropriate events when running a build step', function(done) {
    var build = new Build()
    var container = new Container({ docker: null })
    build.setContainer(container)
    var step = new Step()
    build.addStep(step)
    var callbacks = resolver(5, done)
    build.on('taskStart', callbacks[0])
    build.on('taskEnd', callbacks[1])
    // TODO: Is this a Task plugin test or a build test?
    step.on('start', callbacks[2])
    step.on('end', callbacks[3])
    build.run(callbacks[4]);
  })
  // TODO: This is a test describing how a step behaves, not a build.
  // TODO: Should a build return a 
  it.only('should stream an event', function(done) {
    var build = new Build()
    var step = new Step()
    build.addStep(step)
    var callbacks = resolver(2, function() {
      streamData[0].should.equal('input line 1')
      streamData[1].should.equal('input line 2')
      done()
    })
    var streamData = []
    var chunkProcessor = function(chunk, enc, cb) {
      streamData.push(chunk.toString())
      cb()
    }
    step.getStream().pipe(through2(chunkProcessor, callbacks[0]))
    build.run(callbacks[1])
  })
})
