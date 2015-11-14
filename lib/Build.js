var events = require('events')
var util = require('util')
var async = require('async')

/**
 * A build object is the domain model for a 
 */
var Build = function(options) {
  // The Container object on which this build should be performed.
  this.container = null
  // The array of provision steps that must be run in this build.
  this.steps = []
  events.EventEmitter.call(this)
}

util.inherits(Build, events.EventEmitter)

Build.prototype.setContainer = function(container) {
  this.container = container
}

Build.prototype.addStep = function(step) {
  this.steps.push(step)
}

Build.prototype.runBuild = function() {
}

Build.prototype.run = function(done) {
  var self = this
  var steps = this.steps.map(function(step) {
    return function(cb) {
      self.emit('taskStart')
      step.run(cb)
      self.emit('taskEnd')
    }
  })
  async.series(steps, done);
}

// TODO: Step using *step* and *task* interchangably - it's steps in the yaml it
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
- update the stauts
- run system tasks
- run user tasks

- So this object represents a build which is a serires of tasks that need to be performed
on a container.
- It will be populated by some combination of system configuration and job
specific conifguration (from the .probo.yaml in the repo).
- There will either be a method on the container to construct the build or a method on the build to construct the container.
- Steps can decide whether their failure should abort the build.
- TBD: Should we allow any concurrent steps to run in the build? Probably not for now.

Blog posts I need to write:
  - In defense of fat containers
  - Getting Jiggy with fat containers and docker image layering
  - 
*/

/**
 * @param step {object} - An object consistent with the AbstractTask TaskRunner plugin class.
 * @param done {function} - Callback to be called when this function is complete.
 */
Build.prototype.runStep = function(step, done) {
}

module.exports = Build

