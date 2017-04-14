'use strict';
const EventEmitter = require('events').EventEmitter;
const through2 = require('through2');
const MagicThrough = require('./MagicThrough');
const uuid = require('node-uuid');

var _stream = Symbol('_stream');
var _container = Symbol('_container');
var _state = Symbol('_state');
var _step = Symbol('_step');

class Build extends EventEmitter {

  /**
   * A build object is the domain model for a build run.
   *
   * @param {Object} options - A hash of configuration options.
   * @param {String} options.id - The identifier for this build.
   * @param {Object} options.step - The step to run for this build.
   * @param {String} options.project - The project details for this build.
   */
  constructor(options) {
    super();
    options = options || {};
    this.id = options.id || uuid.v4();
    // The probo Container object to run this build on.
    this.container = options.container;
    this.project = options.project;
    // The step to run as this build.
    this[_step] = options.step || null;
    this[_stream] = new MagicThrough();
    this.reaped = false;
    this.commit = options.commit;
    this.userConfig = options.userConfig;

    var self = this;
  }

  set container(container) {
    this[_container] = container;
  }

  get container() {
    return this[_container];
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

  set step(step) {
    this[_step] = step;
  }

  get step() {
    return this[_step];
  }

  run(done) {
    var self = this;
    self.emit('start', this);
    self.state = 'running';
    self.step.stream.pipe(self.stream);
    self.step.on('stepStart', self.emit.bind(self, 'stepStart'));
    self.step.on('stepEnd', self.emit.bind(self, 'stepEnd'));
    self.step.run(function(error) {
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

}

module.exports = Build;
