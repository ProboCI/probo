'use strict';
class Set {
  constructor() {
    this.steps = [
      this.getTask(0),
      this.getTask(1, true, true),
      this.getTask(2),
    ];
    this.position = 0;
    this.state = 'pending';
    this.handleStepCompletion = this.handleStepCompletion.bind(this);
    this.runNextStep = this.runNextStep.bind(this);
  }
  getTask(createdIndex, continueOnFailure, fail) {
    var index = createdIndex;
    var destinedToFail = fail || false;
    var callback = function(done) {
      var error = null;
      console.log(`task ${index} running`);
      if (destinedToFail) {
        console.log('trying to fail...');
        error = new Error('Step failed');
      }
      done(error);
    };
    callback.continueOnFailure = continueOnFailure || false;
    return callback;
  }
  run(done) {
    this.state = 'running';
    this.runNextStep(function(error) {
      done(error);
    });
  }
  runNextStep(finalCallback) {
    var self = this;
    this.steps[this.position](function(error) {
      self.handleStepCompletion(error, finalCallback);
    });
  }
  handleStepCompletion(error, finalCallback) {
    if (error && !this.steps[this.position].continueOnFailure) {
      return finalCallback(error);
    }
    if (this.position + 1 === this.steps.length) {
      this.state = 'completed';
      return finalCallback();
    }
    this.position++;
    this.runNextStep(finalCallback);
  }
}

var set = new Set();
console.log(set.state);
set.run(function(error) {
  if (error) {
    console.log('not all steps completed…', error);
    return;
  }
  console.log('all steps completed.');
  console.log(set.state);
});
