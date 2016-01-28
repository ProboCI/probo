'use strict';
// var through2 = require('through2');
var should = require('should');
var Resolver = require('multiple-callback-resolver');

var lib = require('..');
var Build = lib.Build;
var StepList = lib.plugins.Step.StepList;
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
    new Build({step: new Step(new Container())}).run(done);
  });
  it('should emit the appropriate events when running a build step', function(done) {
    var build = new Build();
    var container = new Container({docker: null});
    var step = new Step(container);
    build.step = new StepList(container);
    build.step.addStep(step);
    build.container = container;
    var resolver = new Resolver({nonError: true});
    resolver.resolve(function() {
      build.state.should.equal('completed');
      done();
    });
    step.on('start', resolver.createCallback());
    step.on('end', resolver.createCallback());
    build.run(resolver.createCallback());
  });
});
