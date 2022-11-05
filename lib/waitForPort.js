'use strict';

var co = require('co');
var wait = require('co-wait');
var Promise = require('bluebird');
var http = require('http');
var net = require('net');

var debug = function(msg) {
  console.log(`[WAIT-FOR-PORT] ${msg}`);
};

var connectHttp = Promise.promisify(function(host, port, cb) {
  var req = http.request({host, port, method: 'HEAD'}, function(res) {
    cb();
  });
  req.on('error', cb);
  req.end();
});

var connectTcp = Promise.promisify(function(host, port, cb) {
  var socket = net.connect(port, host, function(res) {
    cb();
  });

  socket.on('error', cb);
  socket.end();
});

/**
 * Waits for a port to be available (HTTP/TCP), with a timeout
 * @param {Object} host - Host to connect to
 * @param {Object} port - Port to connect to
 * @param {Object} [opts] - Options
 * @param {Object} [opts.type="http"] - Type of check, "http" or "tcp".
 * @param {Object} [opts.numRetries=20] - Number of retries to make.
 * @param {Object} [opts.retryInterval=500] - Amount of milliseconds to wait between retries.
 * @param {Object} [opts.debug=false] - Will print debug info to console if true.
 * @param {function} [cb] - Callback that will be called with no errors if connected, with an error if timed out
 * @return {Promise} so that this can be used as a promise or with a callback
 */
module.exports = function waitForPort(host, port, opts, cb) {
  if (typeof opts == 'function') {
    cb = opts;
    opts = {};
  }
  opts = opts || {};
  cb = cb || function(err) { if (err) throw err;};

  opts.type = opts.type || 'http';
  var tries = opts.numRetries = opts.numRetries || 20;
  opts.retryInterval = opts.retryInterval || 500;

  port = parseInt(port);

  if (!port) {
    throw new Error('Invalid port: ' + port);
  }

  var validOpts = ['numRetries', 'retryInterval', 'type', 'debug'];
  for (let opt of Object.keys(opts)) {
    if (validOpts.indexOf(opt) < 0) {
      throw new Error(`Invalid opt '${opt}', probably a typo`);
    }
  }

  if (['http', 'tcp'].indexOf(opts.type) < 0) {
    throw new Error('Invalid check type: ' + opts.type);
  }

  if (typeof opts.debug == 'function') {
    debug = opts.debug;
  }

  var connect = connectHttp;
  if (opts.type === 'tcp') {
    connect = connectTcp;
  }

  // co() returns a promise
  return co(function* () {
    var lastError;
    while (--tries >= 0) {
      try {
        if (opts.debug) debug(`connection attempt ${opts.type}://${host}:${port}`);

        yield connect(host, port);
        if (opts.debug) debug('connected');

        return;
      }
      catch (err) {
        if (opts.debug) debug(`connection attempt failed, retrying in ${opts.retryInterval}ms, retries: ${tries}, err: ${err}`);
        lastError = err;
        yield wait(opts.retryInterval);
      }
    }

    if (opts.debug) debug('all retries failed');

    // if we're here, we failed to connect after retries and timeouts
    throw new Error('Failed to connect: ' + lastError.message);
    // use partial application of .bind() to call cb w/o an error
  }).then(cb && cb.bind(null, null))
    .catch(cb);
};

