"use strict";

module.exports = class Shell extends require('./AbstractPlugin') {
  constructor(container, options) {
    super(container, options)
  }

  buildCommand (){
    // If docker exec ever supports specifying the cwd then switch to that.
    return [ 'bash', '-c', 'cd $SRC_DIR ; ' + this.options.command ]
  }

  description (){
    return this.options.command
  }
}
