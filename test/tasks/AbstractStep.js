'use strict';

var Resolver = require('multiple-callback-resolver');
var should = require('should');
var through2 = require('through2');

var MockContainer = require('../fixtures/MockContainer');
var mockContainer = new MockContainer();

var lib = require('../..');
var AbstractStep = lib.plugins.TaskRunner.AbstractPlugin;
var Step = require('../fixtures/TaskPlugin');

describe('AbstractStep', function() {
  it('should throw an exceoption if it is used directly', function() {
    try {
      new AbstractStep(mockContainer);
      throw new Error('Instantiation should have failed.');
    }
    catch (error) {
      error.message.should.containEql('Can\'t instantiate abstract class AbstractPlugin');
      should.exist(error);
    }
  });
  it('should throw an exception if a consuming class does not implement buildCommand', function() {
    class FailureClass extends AbstractStep {}
    try {
      var item = new FailureClass(mockContainer);
      item.run();
    }
    catch (error) {
      should.exist(error);
      error.message.should.equal('AbstractPlugin.buildCommand must be implemented by a subclass');
    }
  });
  it('should timeout if a step takes too long', function(done) {
    var options = {
      delay: 10,
      timeout: 2,
    };
    var step = new Step(mockContainer, options);
    var callbacks = Resolver.resolver(2, function(error, data) {
      should.exist(error);
      // The data first callback should have been invoked with an error.
      should.exist(data[0][0]);
      data[0][0].should.be.instanceof(Error);
      done();
    });
    step.on('timeout', callbacks[0]);
    step.run(callbacks[1]);
  });
  it('should construct the appropriate object stream', function(done) {
    var stream = [];
    class ConcreteStep extends AbstractStep {
      buildCommand() { return []; }
    }
    var step = new ConcreteStep(mockContainer);
    step
      .getStream()
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
    var step = new Step(mockContainer);
    var json = step.toJSON();
    Object.keys(json).length.should.equal(step._jsonAttributes.length);
  });
  it('should calculate the ellapsed time', function() {
    var step = new Step(mockContainer);
    step.startTime = 5;
    step.endTime = 10;
    step.ellapsedTime.should.equal(5);
  });
});

