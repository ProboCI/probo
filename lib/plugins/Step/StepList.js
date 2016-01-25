'use strict';
var events = require('events');

var through2 = require('through2');

var _stream = Symbol('_stream');

class StepList extends events.EventEmitter {

  constructor(container, options) {
    super(options);
    options = options || {};
    this.emitErrors = options.emitErrors || false;
    // The array of provision steps that must be run as a part of this step.
    this.steps = options.steps || [];
    this.currentStepIndex = 0;
    // The step currently being run when iterating on steps.
    this.position = 0;
    this.endedStreams = [];
    this.stepErrors = [];
    this[_stream] = through2.obj();
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
}

module.exports = StepList;
