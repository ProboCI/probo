'use strict';
var through2 = require('through2');

var lib = require('..');
var Build = lib.Build;
var Container = lib.Container;
var Step = require('./fixtures/TaskPlugin');

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
 * TODO: Move this into an include or library, we need it in multiple places.
 *
 * @param {integer} callbackNumber - The number of callbacks to produce and require.
 * @param {function} done - The callback to call once all
 * @return {Array} - An array of functions to be bound to callbacks.
 */
function resolver(callbackNumber, done) {
  var callbacks = [];
  var results = [];
  var calledCallbacks = 0;
  function createCallback() {
    return function() {
      results.push(arguments);
      calledCallbacks++;
      if (calledCallbacks === callbackNumber) {
        done(null, results);
      }
    };
  }
  for (var i = 0; i < callbackNumber; i++) {
    callbacks.push(createCallback());
  }
  return callbacks;
}

describe('Build', function() {
  it('should emit the appropriate events when running a build step', function(done) {
    var build = new Build();
    var container = new Container({docker: null});
    build.setContainer(container);
    var step = new Step();
    build.addStep(step);
    var callbacks = resolver(5, done);
    build.on('taskStart', callbacks[0]);
    build.on('taskEnd', callbacks[1]);
    step.on('start', callbacks[2]);
    step.on('end', callbacks[3]);
    build.run(callbacks[4]);
  });
  it('should stream an event', function(done) {
    var build = new Build({id: 1});
    var step = new Step();
    var streamData = [];
    build.addStep(step);
    var callbacks = resolver(2, function() {
      streamData[0].buildId.should.equal(1);
      streamData[0].data.should.equal('stdout input line 1');
      streamData[0].stream.should.equal('stdout');
      streamData[1].data.should.equal('stdout input line 2');
      streamData[1].stream.should.equal('stdout');
      streamData[2].data.should.equal('stderr input line 1');
      streamData[2].stream.should.equal('stderr');
      streamData[3].data.should.equal('stderr input line 2');
      streamData[3].stream.should.equal('stderr');
      done();
    });
    var chunkProcessor = function(data, enc, cb) {
      data.data = data.data.toString();
      streamData.push(data);
      cb();
    };
    build
      .getStream()
      .pipe(through2.obj(chunkProcessor, callbacks[0]));
    build.run(callbacks[1]);
  });
});
