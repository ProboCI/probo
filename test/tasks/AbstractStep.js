'use strict';

var Resolver = require('multiple-callback-resolver');
var should = require('should');

var MockContainer = require('../fixtures/MockContainer');
var mockContainer = new MockContainer();

var Step = require('../fixtures/TaskPlugin');

describe('AbstractStep', function() {
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
});

