'use strict';
var steps = require('../../lib/plugins').Step;
var should = require('should');

function createStep(Step, opts) {
  var container = {
    log: {child: function() {}},
  };
  return new Step(container, opts);
}

describe('Shell', function() {
  it('initializes properly', function() {
    var step = createStep(steps.Shell, {command: 'command'});

    should.exist(step.id);
    step.id.should.be.type('string');
    step.plugin.should.eql('Shell');
    step.name.should.eql('Shell step');
    step.buildCommand().should.eql('bash -c command'.split(' '));
    step.description().should.eql('command');

    var step2 = createStep(steps.Shell, {command: 'command', name: 'step name'});
    step2.name.should.eql('step name');

    // make sure JSON serializtion for a step has the desired properties
    JSON.parse(JSON.stringify(step)).should.eql({
      id: step.id,
      name: 'Shell step',
      plugin: 'Shell',
      timeout: 1200000,
      options: {command: 'command'},
      exitCode: null,
      startTime: null,
      endTime: null,
    });
  });

  it('emits status upates events', function(done) {
    var step = createStep(steps.Shell, {command: 'command'});
    step.id = 'this is a step id';

    step.on('update', function(context, status, _step) {
      step.should.eql(_step);
      context.should.eql('Shell/Shell step');
      status.should.containEql({
        state: 'pending',
        description: 'command',
      });

      // step gets embedded into the status object
      status.step.should.containEql({
        id: 'this is a step id',
      });

      done();
    });

    step.updateStatus({state: 'pending'});
  });
});
