"use strict";

var read = require('co-read')
var logger = require('../logger')

/**
 * Runs all the steps in a build
 * @param {Array} tasks - An array of task to run. Each task is a pluging instance.
 * @param {Object} [opts = {}] - Options object (optional).
 * @param {Logger} opts.container - Container instance in use
 * @param {Logger} [opts.log] - Log instance to use. A child will be created.
 */
module.exports = function* runBuild(tasks, opts){
  opts = opts || {}
  var log = opts.log ? opts.log.child({component: 'build runner'}) : logger.getLogger('build runner')

  try {
    // steps is an array of Plugins with promisified run methods
    for(let task of tasks){
      // first, yield step to kick off the run
      log.debug("Step exec started:", task.name)

      let result = yield task.run

      try {
        // stream output back to the log (for now)
        log.debug(`${task.name} OUTPUT`)
        var chunk
        while((chunk = yield read(result.stream))){
          log.debug(chunk.toString().trim())
        }

        // check exit code
        var data = yield result.exec // returns result of container.inspect call
        var exit_code = data.ExitCode
        log.debug(`EXIT_CODE: ${exit_code}`)
      } catch(e){
        log.error({err: e}, "Task execution failed")
      }
    }

    log.debug('ALL STEPS COMPLETED')
  } catch(error){
    log.error({err: error}, "Error processing steps")
  }

  // stop the running container after all steps are done
  // log.info({state: yield opts.container.getState()}, 'container status')

  log.info("Stopping container...")

  try {
    yield opts.container.stop()
    log.info("Container stopped")
  } catch(e){
    log.error({err: e}, "Could not stop container")
  }

  log.info({state: yield opts.container.getState()}, 'container status')
}
