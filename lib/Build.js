'use strict';
var EventEmitter = require('events').EventEmitter;
var through2 = require('through2');
var uuid = require('node-uuid');

var _stream = Symbol('_stream');
var _container = Symbol('_container');
var _state = Symbol('_state');

class Build extends EventEmitter {

  /**
   * A build object is the domain model for a build run.
   *
   * @param {object} options - A hash of configuration options.
   * @param {string} options.id - The identifier for this build.
   * @param {string} options.steps - The array of steps to run.
   */
  constructor(options) {
    super();
    options = options || {};
    this.id = options.id || uuid.v4();
    // The probo Container object to run this build on.
    this.container = null;
    // The step to run as this build.
    this.step = options.step;
    this[_stream] = through2.obj();
  }

  set container(container) {
    this[_container] = container;
  }

  set state(state) {
    if (this[_state] !== state) {
      this[_state] = state;
      this.emit(state);
      this.emit('stateChange', state);
    }
  }

  get state() {
    return this[_state];
  }


  run(done) {
    var self = this;
    // this.step.run(done);
    self.emit('start', this);
    self.state = 'running';
    self.step.stream.pipe(self.stream);
    self.step.run(function(error) {
      self.stream.end();
      self.emit('end', this);
      self.state = error ? 'failed' : 'completed';
      done(error);
    });
  }

  get stream() {
    return this[_stream];
  }

  /**
   * Get a JSON text stream representation of the object stream.
   *
   * @return {ReadableStream} - An text stream of multiplexed stdout and stderr from this build.
   */
  get jsonStream() {
    return this.stream.pipe(through2.obj(function(data, enc, cb) {
      cb(null, JSON.stringify(data) + '\n');
    }));
  }

  save(done) {
  }
}


/*

Current implementation functionality in CM's runBuild() method
- create component logger
- store build object (handle error, bail if that fails)
- construct container config
- instantiate congainer with config
- gather the build steps (both system and user, this shouldn't happen here and hsould be more dynamic)
- update the status for all system build tasks, but group them together suppressing regular output
- bind the 'update' event on the task plugins to a handler that runs update status
- run container create
- update the status for system tasks
- handle the case where the container is already running
- invoke container.start()
- handle errors related to environments already existing, etc
- update the status
- run system tasks
- run user tasks

Current implementation functionality in task_runner.js
- create component logger
- loop over steps to set them to pending
- send log output to loom explicitly

- So this object represents a build which is a serires of tasks that need to be performed
on a container.
- It will be populated by some combination of system configuration and job
specific conifguration (from the .probo.yaml in the repo).
- There will either be a method on the container to construct the build or a method on the build to construct the container.
- Steps can decide whether their failure should abort the build.
- TBD: Should we allow any concurrent steps to run in the build? Probably not for now.
*/

module.exports = Build;

