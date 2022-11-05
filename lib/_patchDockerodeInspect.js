'use strict';

/**
 *
 * Patches Dockerode's container.inspect function to take
 * an optional opts as the first argument to be able to get
 * container sizes (and use other future APIs)
 *
 * @module
 */

var Container = require('dockerode/lib/container');
var util = require('dockerode/lib/util');

/**
 * Inspect
 * @param {Options}   opts     Options (optional)
 * @param  {Function} callback Callback, if supplied will query Docker.
 * @return {Object}            ID only and only if callback isn't supplied.
 */
Container.prototype.inspect = function(opts, callback) {
  var args = util.processArgs(opts, callback);

  if (typeof args.callback === 'function') {
    var optsf = {
      path: '/containers/' + this.id + '/json?',
      method: 'GET',
      options: args.opts,
      statusCodes: {
        200: true,
        404: 'no such container',
        500: 'server error',
      },
    };

    this.modem.dial(optsf, function(err, data) {
      args.callback(err, data);
    });
  }
  else {
    return JSON.stringify({
      id: this.id,
    });
  }
};
