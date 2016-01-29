'use strict';

var through2 = require('through2');
var should = require('should');
var Resolver = require('multiple-callback-resolver');

var lib = require('../..');
var Build = lib.Build;
var StepList = lib.plugins.Step.StepList;
var MockContainer = require('../fixtures/MockContainer');
var mockContainer = new MockContainer();
mockContainer.log.logLevel = Number.POSITIVE_INFINITY;

var Step = require('../fixtures/TestStep');

describe('StepList', function() {
  it('should run a set of steps passed to the constructor', function(done) {
    var step1 = new Step(mockContainer);
    var step2 = new Step(mockContainer);
    var step3 = new Step(mockContainer);
    var list = new StepList(mockContainer, {steps: [step1, step2]});
    list.steps.should.containEql(step1);
    list.steps.should.containEql(step2);
    list.steps.should.not.containEql(step3);
    list.run(function(error) {
      step1.state.should.equal('completed');
      step2.state.should.equal('completed');
      step3.state.should.not.equal('completed');
      should.not.exist(error);
      done();
    });
  });
  it('should emit the appropriate events when running a build step', function(done) {
    var container = new MockContainer({docker: null});
    var stepList = new StepList(container);
    stepList.addStep(new Step(container));
    var resolver = new Resolver({nonError: true});
    resolver.resolve(done);

    /*
    stepList.on('stepStart', resolver.createCallback());
    stepList.on('stepEnd', resolver.createCallback());
    // stepList.on('start', resolver.createCallback());
    // stepList.on('end', resolver.createCallback());
    */

    build.run(resolver.createCallback());
  });
  it('should stream output from a child step', function(done) {
    var container = new MockContainer();
    var step = new Step(container, {id: 1});
    var stepList = new StepList(container);
    var streamData = [];
    stepList.addStep(step);
    var callbacks = Resolver.resolver(2, {nonError: true}, function() {
      streamData[0].stepId.should.equal(1);
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
    stepList.stream
      .pipe(through2.obj(chunkProcessor, callbacks[0]));
    stepList.run(callbacks[1]);
  });
  it('should stream output from multiple child steps', function(done) {
    var container = new MockContainer();
    var step1 = new Step(container, {id: 1, prefix: 'first '});
    var step2 = new Step(container, {id: 2, prefix: 'second '});
    var stepList = new StepList(container);
    var streamData = [];
    stepList.addStep(step1);
    stepList.addStep(step2);
    var callbacks = Resolver.resolver(2, {nonError: true}, function() {
      streamData[0].stepId.should.equal(1);
      streamData[0].data.should.equal('first stdout input line 1');
      streamData[0].stream.should.equal('stdout');
      streamData[1].data.should.equal('first stdout input line 2');
      streamData[1].stream.should.equal('stdout');
      streamData[2].data.should.equal('first stderr input line 1');
      streamData[2].stream.should.equal('stderr');
      streamData[3].data.should.equal('first stderr input line 2');
      streamData[3].stream.should.equal('stderr');
      streamData[4].data.should.equal('second stdout input line 1');
      streamData[4].stream.should.equal('stdout');
      streamData[5].data.should.equal('second stdout input line 2');
      streamData[5].stream.should.equal('stdout');
      streamData[6].data.should.equal('second stderr input line 1');
      streamData[6].stream.should.equal('stderr');
      streamData[7].data.should.equal('second stderr input line 2');
      streamData[7].stream.should.equal('stderr');
      done();
    });
    var chunkProcessor = function(data, enc, cb) {
      data.data = data.data.toString();
      streamData.push(data);
      cb();
    };
    stepList.stream
      .pipe(through2.obj(chunkProcessor, callbacks[0]));
    stepList.run(callbacks[1]);
  });
  it.only('should stream output from nested step lists', function(done) {
    var container = new MockContainer();
    var stepList = new StepList(container);
    var build = new Build({step: stepList, container});
    build.step = stepList;
    var streamData = [];
    stepList.addStep(new Step(container, {id: 'top level step', prefix: 'top level first '}));
    var nestedList = new StepList(container);
    nestedList.addStep(new Step(container, {id: 'nested step 1', prefix: 'nested first '}));
    nestedList.addStep(new Step(container, {id: 'nested step 2', prefix: 'nested second '}));
    var doubleNested = new StepList(container);
    doubleNested.addStep(new Step(container, {id: 'double nested step 1', prefix: 'double nested first '}));
    nestedList.addStep(doubleNested);
    stepList.addStep(nestedList);
    var resolver = new Resolver({nonError: true});
    resolver.resolve(function(error, result) {
      console.log('raw step', result['raw step'][1]);
      console.log('step', result['step'][1]);
      console.log('build', result['build'][1]);
      streamData.length.should.equal(16);
      done();
    });
    var chunkProcessor = function(data, enc, cb) {
      data.data = data.data.toString();
      streamData.push(data);
      cb();
    };
    function makeCounter(name) {
      var finished = resolver.createCallback(name);
      var count = 0;
      return through2.obj(function(data, enc, cb) {
        count++;
        cb(null, data);
      }, function() {
        finished(null, count);
      });
    }
    build.stream.pipe(makeCounter('build'));
    build.step.stream.pipe(makeCounter('step'));
    stepList.stream.pipe(makeCounter('raw step'));
    build.stream
      .pipe(through2.obj(chunkProcessor, resolver.createCallback()));
    build.run(resolver.createCallback());
  });
  it('should emit an error if configured to on failure', function(done) {
    var container = new MockContainer();
    var stepList = new StepList(container, {emitErrors: true});
    stepList.addStep(new Step(new MockContainer(), {fail: true}));
    stepList.on('error', function(error) {
      should.exist(error);
      done();
    });
    stepList.run();
  });
  it('should stop running steps when the first one fails by default', function(done) {
    var container = new MockContainer();
    var step = new StepList(container);
    var step1 = new Step(container);
    step.addStep(step1);
    var step2 = new Step(container, {fail: true});
    step.addStep(step2);
    var step3 = new Step(container);
    step.addStep(step3);
    step.run(function(error) {
      step1.state.should.equal('completed');
      step2.state.should.equal('errored');
      step3.state.should.equal('pending');
      should.exist(error);
      done(null);
    });
  });
  it('should continue running steps when a failed step is marked continueOnFailure', function(done) {
    var container = new MockContainer();
    var step = new StepList(container);
    var step1 = new Step(container);
    step.addStep(step1);
    var step2 = new Step(container, {fail: true, continueOnFailure: true});
    step.addStep(step2);
    var step3 = new Step(container);
    step.addStep(step3);
    step.run(function(error) {
      should.exist(error);
      step1.state.should.equal('completed');
      step2.state.should.equal('errored');
      step3.state.should.equal('completed');
      step.state.should.equal('failed');
      done(null);
    });
  });
  it('should allow steps marked as optional to fail without marking the step as a failure', function(done) {
    var container = new MockContainer();
    var stepList = new StepList(container);
    var step1 = new Step(container);
    stepList.addStep(step1);
    var step2 = new Step(container, {fail: true, continueOnFailure: true, optional: true});
    stepList.addStep(step2);
    var step3 = new Step(container);
    stepList.addStep(step3);
    stepList.run(function(error) {
      should.not.exist(error);
      step1.state.should.equal('completed');
      step2.state.should.equal('errored');
      step3.state.should.equal('completed');
      stepList.state.should.equal('completed');
      done(null);
    });
  });
});
