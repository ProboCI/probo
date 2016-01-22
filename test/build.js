'use strict';
var through2 = require('through2');
var should = require('should');
var Resolver = require('multiple-callback-resolver');

var lib = require('..');
var Build = lib.Build;
var Container = require('./fixtures/MockContainer');
var Step = require('./fixtures/TestStep');

/**
 * @param {string} name - The name of the event to emit.
 * @param {mixed} data - The data payload to include, usually an object.
 */
Step.prototype.emitEvent = function(name, data) {
  this.emit(name, data);
  this.emit('change', data);
};

describe('Build', function() {
  it('should not error if it is run and there are no steps', function(done) {
    new Build().run(done);
  });
  it('should emit the appropriate events when running a build step', function(done) {
    var build = new Build();
    var container = new Container({docker: null});
    build.setContainer(container);
    var step = new Step(container);
    build.addStep(step);
    var callbacks = Resolver.resolver(5, {nonError: true}, done);
    build.on('stepStart', callbacks[0]);
    build.on('stepEnd', callbacks[1]);
    step.on('start', callbacks[2]);
    step.on('end', callbacks[3]);
    build.run(callbacks[4]);
  });
  it('should stream an event', function(done) {
    var build = new Build({id: 1});
    var step = new Step(new Container());
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
    build.addStep(new Step(new Container(), {fail: true}));
    build.on('error', function(error) {
      should.exist(error);
      done();
    });
    build.run();
  });
  it('should stop running steps when the first one fails by default', function(done) {
    var build = new Build();
    var container = new Container();
    build.setContainer(container);
    var step1 = new Step(container);
    build.addStep(step1);
    var step2 = new Step(container, {fail: true});
    build.addStep(step2);
    var step3 = new Step(container);
    build.addStep(step3);
    build.run(function(error) {
      step1.state.should.equal('completed');
      step2.state.should.equal('errored');
      step3.state.should.equal('pending');
      should.exist(error);
      done(null);
    });
  });
  it('should continue running steps when a failed step is marked continueOnFailure', function(done) {
    var build = new Build();
    var container = new Container();
    build.setContainer(container);
    var step1 = new Step(container);
    build.addStep(step1);
    var step2 = new Step(container, {fail: true, continueOnFailure: true});
    build.addStep(step2);
    var step3 = new Step(container);
    build.addStep(step3);
    build.run(function(error) {
      should.exist(error);
      step1.state.should.equal('completed');
      step2.state.should.equal('errored');
      step3.state.should.equal('completed');
      build.state.should.equal('failed');
      done(null);
    });
  });
  it('should allow steps marked as optional to fail without marking the build as a failure', function(done) {
    var build = new Build();
    var container = new Container();
    build.setContainer(container);
    var step1 = new Step(container);
    build.addStep(step1);
    var step2 = new Step(container, {fail: true, continueOnFailure: true, optional: true});
    build.addStep(step2);
    var step3 = new Step(container);
    build.addStep(step3);
    build.run(function(error) {
      should.not.exist(error);
      step1.state.should.equal('completed');
      step2.state.should.equal('errored');
      step3.state.should.equal('completed');
      build.state.should.equal('completed');
      done(null);
    });
  });
  // Should the step be responsible for this or the build? I think the the Step.
  it('should suppress the output of steps marked not for reporting');
  describe('step initialization', function() {
    it('should initialize steps before running them');
    // TODO: Do we need a finalize step really?
    it('should finalize steps after finishing them');
  });
});
