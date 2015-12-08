'use strict';

var logger = require('../logger');
var through2 = require('through2');

/**
 * Runs all the steps in a build
 * @param {Array} tasks - An array of task to run. Each task is a pluging instance.
 * @param {Object} [opts = {}] - Options object (optional).
 * @param {Logger} opts.container - Container instance in use
 * @param {Logger} [opts.log] - Log instance to use. A child will be created.
 * @param {Logger} [opts.nostop=false] - If set to true, don't stop the container after all tasks are finished
 */
module.exports = function* runTasks(tasks, opts) {
  opts = opts || {};
  var log = opts.log ? opts.log.child({component: 'task runner'}) : logger.getLogger('task runner');

  // initialize all tasks in pending state (unless this is the setup phase)
  if (!opts.setup) {
    for (let task of tasks) {
      task.updateStatus({state: 'pending', action: 'pending'});
    }
  }

  var taskError = null;

  try {
    // Steps is an array of Plugins with promisified run methods
    for (let task of tasks) {
      try {
        log.debug('Step exec started:', task.name);

        // First, yield step to kick off the run.
        let result = yield task.run;

        log.debug(`${task.name} (${task.buildCommand()}) OUTPUT`);

        // little hack to get rid of the first 8 bytes of every chunk coming out of exec
        // TODO: figure out why it's really happening
        result.stream = result.stream.pipe(through2(function(chunk, enc, cb) {
          cb(null, chunk.slice(8));  // this is a cheap pointer manipulation operation
        }));

        // send output to external logger
        if (opts.loom) {
          result.stream
            .pipe(opts.loom.createLogStream({
              task: {id: task.id, name: task.name, plugin: task.plugin},
              buildId: task.container.build.id,
            }, {
              log: log,
              // use our own 'well-known' id
              id: `build-${task.container.build.id}-task-${task.id}`,
              // make it so, number 1!
              force: true,
            }));
        }
        else {
          log.debug('Loom NOT configured');
        }

        // stream output back to the log (for now)
        result.stream.on('data', function(chunk) {
          log.debug(chunk.toString().trim());
        });

        // check exit code
        var data = yield result.exec; // returns result of container.inspect call
        var exitCode = data.ExitCode;
        log.debug(`EXIT CODE: ${exitCode}`);

        if (opts.setup && exitCode !== 0) {
          // if a setup task failed, bail from the whole thing
          throw new Error(`Setup task ${task.name} failed with exit code ${exitCode}`);
        }

      }
      catch (e) {
        log.error({err: e}, 'Task execution failed');

        if (opts.setup) {
          throw e;
        }
      }
    }

    log.debug('ALL STEPS COMPLETED');
  }
  catch (error) {
    log.error({err: error}, 'Error processing steps');

    // save the error until after we've cleaned up
    taskError = error;
  }

  // opts.setup implies .nostop
  if (opts.setup) {
    opts.nostop = true;
  }

  // if there's an error, always stop container, even during the setup phase
  if (!opts.nostop || taskError) {
    // cleanup: stop the running container after all steps are done
    // log.info({state: yield opts.container.getState()}, 'container status')
    log.info('Stopping container...');

    try {
      yield opts.container.stop();
      log.info('Container stopped');
    }
    catch (e) {
      log.error({err: e}, 'Could not stop container');
    }
  }

  log.info({state: yield opts.container.getState()}, 'container status');

  // after cleanup, if we threw an error running tasks, rethrow it now
  if (taskError) {
    throw taskError;
  }
};
