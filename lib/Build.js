'use strict';
var events = require('events');
var util = require('util');
var through2 = require('through2');
var async = require('async');

/**
 * A build object is the domain model for a build run.
 *
 * @param {object} options - A hash of configuration options.
 * @param {string} options.id - The identifier for this build.
 */
var Build = function(options) {
  options = options || {};
  // TODO: Self assign GUID
  this.id = options.id || '';
  this.emitErrors = options.emitErrors || false;
  // The dockerode Container object on which this build should be performed.
  this.container = null;
  // The array of provision steps that must be run in this build.
  this.steps = [];
  this.run = this.run.bind(this);
  this.stream = through2.obj();
  this.endedStreams = [];
  this._getRunnableStep = this._getRunnableStep.bind(this);
  events.EventEmitter.call(this);
};

util.inherits(Build, events.EventEmitter);

Build.prototype.setContainer = function(container) {
  this.container = container;
};

Build.prototype.addStep = function(step) {
  this.steps.push(step);
};

Build.prototype.run = function(done) {
  var steps = this.steps.map(this._getRunnableStep);
  async.series(steps, done);
};

/**
 * Run a step
 * @param {function} done - A callbackt or invoke whent he step is complete.
 */
Build.prototype.runStep = function(done) {
};

Build.prototype.getStream = function() {
  return this.stream;
};

Build.prototype._getRunnableStep = function(step) {
  var self = this;
  return function(cb) {
    self.emit('taskStart', step);
    self.attachStream(step.getStream());
    step.run(function(error) {
      if (error) return self.handleError(error, cb);
      self.emit('taskEnd', step);
      return cb();
    });
  };
};

Build.prototype.attachStream = function(stream) {
  var self = this;
  var itemDecorator = function(data, enc, cb) {
    data.buildId = self.id;
    this.push(data);
    cb();
  };
  stream
    .pipe(through2.obj(itemDecorator, self.streamEndHandler.bind(self, stream)))
    .pipe(this.stream, {end: false});
};

Build.prototype.streamEndHandler = function(stream) {
  this.endedStreams.push(stream);
  if (this.endedStreams.length === this.steps.length) {
    this.stream.end();
  }
};

Build.prototype.handleError = function(error, done) {
  if (this.emitErrors) {
    this.emit('error', error);
  }
  return done(error);
};

Build.prototype.save = function(done) {
};

// TODO: Stop using *step* and *task* interchangably - it's steps in the yaml it
// sould be steps everywhere.

/*

Current implementation functionality in CM's runBuild() method
- create logger
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

- So this object represents a build which is a serires of tasks that need to be performed
on a container.
- It will be populated by some combination of system configuration and job
specific conifguration (from the .probo.yaml in the repo).
- There will either be a method on the container to construct the build or a method on the build to construct the container.
- Steps can decide whether their failure should abort the build.
- TBD: Should we allow any concurrent steps to run in the build? Probably not for now.
*/

module.exports = Build;

