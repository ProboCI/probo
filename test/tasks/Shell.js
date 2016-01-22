'use strict';
var tasks = require('../../lib/plugins').Step;
var should = require('should');

function createTask(Task, opts) {
  var container = {
    log: {child: function() {}},
  };
  return new Task(container, opts);
}

describe('Shell', function() {
  it('initializes properly', function() {
    var task = createTask(tasks.Shell, {command: 'command'});

    should.exist(task.id);
    task.id.should.be.type('string');
    task.plugin.should.eql('Shell');
    task.name.should.eql('Shell step');
    task.buildCommand().should.eql('bash -c command'.split(' '));
    task.description().should.eql('command');

    var task2 = createTask(tasks.Shell, {command: 'command', name: 'task name'});
    task2.name.should.eql('task name');

    // make sure JSON serializtion for a task has the desired properties
    JSON.parse(JSON.stringify(task)).should.eql({
      id: task.id,
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
    var task = createTask(tasks.Shell, {command: 'command'});
    task.id = 'this is a task id';

    task.on('update', function(context, status, _task) {
      task.should.eql(_task);
      context.should.eql('Shell/Shell step');
      status.should.containEql({
        state: 'pending',
        description: 'command',
      });

      // task gets embedded into the status object
      status.task.should.containEql({
        id: 'this is a task id',
      });

      done();
    });

    task.updateStatus({state: 'pending'});
  });
});
