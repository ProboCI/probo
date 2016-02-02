'use strict';
var through2 = require('through2');

var AbstractStep = require('./AbstractStep');

class StepList extends AbstractStep {

  constructor(container, options) {
    super(container, options);
    options = options || {};
    this.emitErrors = options.emitErrors || false;
    // The array of provision steps that must be run as a part of this step.
    this.steps = options.steps || [];
    this.currentStepIndex = 0;
    // The step currently being run when iterating on steps.
    this.position = 0;
    this.endedStreams = [];
    this.stepErrors = [];

    var self = this;
    this.stream.pipe(through2.obj(function(data, enc, cb) { console.log(self.id + ' step list message received....', data.data); cb(null, data); }));
    this.stream.on('end', function() { console.log('stream closed for list ' + self.id); });
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

  addStep(step) {
    this.steps.push(step);
    // TODO: We're only passing the build in so that we can use its id to augment our logging
    // and I think this is a violation of the principle of least knowledge.
    // step.build = this;
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

  runNextStep(finalCallback) {
    var self = this;
    var step = self.steps[this.position];
    self.emit('stepStart', step);
    // Support bubbling stepStart and end from child step lists.
    step.on('stepStart', self.emit.bind(self, 'stepStart'));
    step.on('stepEnd', self.emit.bind(self, 'stepEnd'));
    self.attachStream(step.stream);
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

    /*
    var self = this;
    var itemDecorator = function(data, enc, cb) {
      data.stepId = self.id;
      this.push(data);
      cb();
    };
    */
    stream
      // .pipe(through2.obj(itemDecorator, self.streamEndHandler.bind(self, stream)))
      .pipe(this.stream, {end: false});
    stream.on('end', this.streamEndHandler.bind(this, stream));
  }

  streamEndHandler(stream) {
    this.endedStreams.push(stream);
    this.log.warn(`${this.id} handler invoked 🍗  ended: ${this.endedStreams.length} steps: ${this.steps.length}`);
    if (this.endedStreams.length === this.steps.length) {
      // this.log.error('steplist stream offifically ending');
      this.stream.end();
    }
  }

  handleError(error, done) {
    if (this.emitErrors) {
      this.emit('error', error);
    }
    return done(error);
  }
}

module.exports = StepList;
