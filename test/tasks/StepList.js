'use strict';

var should = require('should');

var lib = require('../..');
var StepList = lib.plugins.TaskRunner.StepList;
var MockContainer = require('../fixtures/MockContainer');
var mockContainer = new MockContainer();
mockContainer.log.logLevel = Number.POSITIVE_INFINITY;

var Step = require('../fixtures/TaskPlugin');

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
});
