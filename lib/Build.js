'use strict';
var events = require('events');
var through2 = require('through2');
var uuid = require('node-uuid');

class Build extends events.EventEmitter {

  /**
   * A build object is the domain model for a build run.
   *
   * @param {object} options - A hash of configuration options.
   * @param {string} options.id - The identifier for this build.
   */
  constructor(options) {
    super();
    options = options || {};
    this.id = options.id || uuid.v4();
    this.emitErrors = options.emitErrors || false;
    // The dockerode Container object on which this build should be performed.
    this.container = null;
    // The array of provision steps that must be run in this build.
    this.steps = [];
    // The step currently being run when iterating on steps.
    this.position = 0;
    this.stream = through2.obj();
    this.endedStreams = [];
    this.stepErrors = [];
    // Used when iterating over the steps to determine the current step that we're running.
    this.currentStepIndex = 0;
    events.EventEmitter.call(this);
  }

  setContainer(container) {
    this.container = container;
  }

  addStep(step) {
    this.steps.push(step);
  }

  run(done) {
    this.state = 'running';
    if (this.steps.length === 0) {
      return done();
    }
    this.runNextStep(function(error) {
      if (done) {
        return done(error);
      }
    });
  }


  getStream() {
    return this.stream;
  }

  runNextStep(finalCallback) {
    var self = this;
    var step = this.steps[this.position];
    self.emit('stepStart', step);
    self.attachStream(step.getStream());
    step.run(function(error) {
      self.emit('stepEnd', step);
      self.handleStepCompletion(error, finalCallback);
    });
  }

  handleStepCompletion(error, finalCallback) {
    var step = this.steps[this.position];
    if (error) {
      if (this.emitErrors) {
        this.emit('error', error);
      }
      if (!step.optional) {
        this.stepErrors.push(error);
      }
      if (!step.continueOnFailure) {
        return finalCallback(error);
      }
    }
    if (this.position + 1 === this.steps.length) {
      this.state = 'completed';
      if (this.stepErrors.length > 0) {
        error = new Error('An optional step experienced an error.');
        error.stepErrors = this.stepErrors;
        if (!step.optional) {
          this.state = 'failed';
        }
      }
      return finalCallback(error);
    }
    this.position++;
    this.runNextStep(finalCallback);
  }

  attachStream(stream) {
    var self = this;
    var itemDecorator = function(data, enc, cb) {
      data.buildId = self.id;
      this.push(data);
      cb();
    };
    stream
      .pipe(through2.obj(itemDecorator, self.streamEndHandler.bind(self, stream)))
      .pipe(this.stream, {end: false});
  }

  streamEndHandler(stream) {
    this.endedStreams.push(stream);
    if (this.endedStreams.length === this.steps.length) {
      this.stream.end();
    }
  }

  handleError(error, done) {
    if (this.emitErrors) {
      this.emit('error', error);
    }
    return done(error);
  }

  save(done) {
  }
}

// TODO: Stop using *step* and *task* interchangably - it's steps in the yaml it
// sould be steps everywhere.

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

