'use strict';
var through2 = require('through2');
var should = require('should');
var Resolver = require('multiple-callback-resolver');

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

describe.only('Build', function() {
  it('should emit the appropriate events when running a build step', function(done) {
    var build = new Build();
    var container = new Container({docker: null});
    build.setContainer(container);
    var step = new Step();
    build.addStep(step);
    var callbacks = Resolver.resolver(5, {nonError: true}, done);
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
    var callbacks = Resolver.resolver(2, {nonError: true}, function() {
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
  it('should emit an error if configured to on failure', function(done) {
    var build = new Build({emitErrors: true});
    build.addStep(new Step({fail: true}));
    build.on('error', function(error) {
      should.exist(error);
      done();
    });
    build.run();
  });
  it('should stop running tasks when the first one fails by default', function(done) {
    var build = new Build();
    build.setContainer = new Container({docker: null});
    var step1 = new Step();
    build.addStep(step1);
    var step2 = new Step({fail: true});
    build.addStep(step2);
    var step3 = new Step();
    build.addStep(step3);
    build.run(function(error) {
      step1.state.should.equal('completed');
      step2.state.should.equal('errored');
      step3.state.should.equal('pending');
      should.exist(error);
      done(null);
    });
  });
  it('should continue running tasks when a failed task is marked continueOnFailure', function(done) {
    var build = new Build();
    build.setContainer = new Container({docker: null});
    var step1 = new Step();
    build.addStep(step1);
    var step2 = new Step({fail: true});
    build.addStep(step2);
    var step3 = new Step();
    build.addStep(step3);
    build.run(function(error) {
      step1.state.should.equal('completed');
      step2.state.should.equal('errored');
      step3.state.should.equal('completed');
      should.exist(error);
      done(null);
    });
  });
  it('should allow tasks marked as optional to fail without makring the build as a failure');
  it('should suppress the output of steps marked not for reporting');
});
