"use strict";

var through2 = require('through2')

module.exports = class Script extends require('./AbstractPlugin') {

  // requires options:
  //  - script: string to pipe to the container on stdin or an array of strings
  //  - secrets: Array of secret strings that need to be filtered out of output
  constructor(container, options) {
    super(container, options)
    options.tty = false

    this.setScript(options.script || "")

    var self = this
    this.on("running", function(){
      self.runScript()
    })
  }

  setScript(script){

    if(!Array.isArray(script)){
      script = script.split("\n")
    }


    // Set up terminal niceness
    script = [
      'unset HISTFILE',    // don't keep track of history
      "export PS4='\$ '",  // set command echo prefix to '$' from a default of '+'
      'set -x',            // enables command echoing
      'cd $SRC_DIR'        // default CWD to $SRC_DIR
    ].concat(script)

    script = script.join("\n")

    // make sure script ends with a newline
    if(script[script.length-1] !== '\n'){
      script = script + '\n'
    }

    this.script = script

  }

  runScript(){
    this.createScriptStream(this.process.stream).end(this.script)
  }

  createScriptStream(docker_stream){
    var stream = through2(
      function (chunk, enc, cb) { cb(null, chunk) }, // transform is a noop
      function (cb) {
        // flush function, send 'exit' to terminate the docker process
        this.push('exit\n');
        cb();
      }
    )

    // docker stream is an HTTP Duplex stream, so we can't close it
    // from this end without terminating the connection prematurely
    stream.pipe(docker_stream, {end: false})


    // filter out secret strings
    var self = this
    if(self.options.secrets){
      var filtered = through2(
        function (chunk, enc, cb) {
          for(var secret of self.options.secrets){
            chunk = chunk.toString().replace(secret, "<*****>")
          }

          cb(null, chunk)
        }
      )

      docker_stream.pipe(filtered)
      self.process.stream = filtered
    }

    return stream
  }

  buildCommand() {
    return [ 'bash' ]
  }

  description() {
    return "script"
  }
}
