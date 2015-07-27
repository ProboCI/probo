"use strict";

module.exports = class Shell extends require('./AbstractPlugin') {
  constructor(container, options) {
    super(container, options)
  }

  buildCommand (){
    return [ 'bash', '-c', this.options.command ]
  }

  description (){
    return this.options.command
  }
}
