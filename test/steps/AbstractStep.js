'use strict';

var Resolver = require('multiple-callback-resolver');
var should = require('should');
var through2 = require('through2');

var MockContainer = require('../fixtures/MockContainer');

var lib = require('../..');
var AbstractStep = lib.plugins.Step.AbstractStep;
var Step = require('../fixtures/TestStep');

describe('AbstractStep', function() {
  it('should throw an exceoption if it is used directly', function() {
    var mockContainer = new MockContainer();
    try {
      new AbstractStep(mockContainer);
      throw new Error('Instantiation should have failed.');
    }
    catch (error) {
      error.message.should.containEql('Can\'t instantiate abstract class AbstractStep');
      should.exist(error);
    }
  });
  it('should throw an exception if a consuming class does not implement buildCommand', function() {
    class FailureClass extends AbstractStep {}
    var mockContainer = new MockContainer();
    try {
      var item = new FailureClass(mockContainer);
      item.run();
    }
    catch (error) {
      should.exist(error);
      error.message.should.equal('AbstractStep.buildCommand must be implemented by a subclass');
    }
  });
  it('should timeout if a step takes too long', function(done) {
    var mockContainer = new MockContainer({timeout: true});
    var options = {
      // In our test step delay retards our call to the done function.
      delay: 10,
      timeout: 2,
    };
    var step = new Step(mockContainer, options);
    var resolver = new Resolver();
    resolver.resolve(function(error, results) {
      should.exist(error);
      // The data first callback should have been invoked with an error.
      should.exist(results.timeout[0]);
      results.timeout[0].message.should.equal('Step step exited due to timeout.');
      results.timeout[0].should.be.instanceof(Error);
      results.run[0].should.be.instanceof(Error);
      done();
    });
    step.on('timeout', resolver.createCallback('timeout'));
    step.run(resolver.createCallback('run'));
  });
  it('should construct the appropriate object stream', function(done) {
    var mockContainer = new MockContainer();
    var stream = [];
    class ConcreteStep extends AbstractStep {
      buildCommand() { return []; }
    }
    var step = new ConcreteStep(mockContainer);
    step.stream
      .pipe(through2.obj(function(data, enc, cb) {
        stream.push(data);
        cb();
      }));
    step.run(function(error) {
      should.not.exist(error);
      stream[0].stream.should.equal('stdout');
      stream[0].data.should.equal('stdOut: data written 1');
      stream[10].stream.should.equal('stderr');
      stream[10].data.should.equal('stdError: data written 1');
      done();
    });
  });
  it('should serialize to json including the appropriate attributes', function() {
    var mockContainer = new MockContainer();
    var step = new Step(mockContainer);
    var json = step.toJSON();
    Object.keys(json).length.should.equal(step._jsonAttributes.length);
  });
  it('should calculate the ellapsed time', function() {
    var mockContainer = new MockContainer();
    var step = new Step(mockContainer);
    step.startTime = 5;
    step.endTime = 10;
    step.ellapsedTime.should.equal(5);
  });
});

