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
  var steps = this.steps.map(function(step) { return step.run });
  async.series(steps, done);
}

/*

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

