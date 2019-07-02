'use strict';

var http = require('http');
var url = require('url');

/**
 * Create a loom client
 * @param {Object} config - Loom configuration - url
 * @param {Object} config.url - Loom url of server
 * @param {Object} config.token - API token for loom
 * @param {Logger} [log] - Bunyan logger instance
 * @return {object} - The loom client.
 */
function createClient(config, log) {
  config = config || {};
  if (!config.url) {
    throw new Error('url config required for loom client');
  }

  log = log ? log.child({component: 'loom'}) : require('./logger').get('loom');

  log.info({config}, 'configuring loom');

  return {
    config: config,
    createLogStream: function(metadata, opts) {
      var _log = opts.log ? log.child({component: 'loom'}) : log;

      var loomHandler = function(res) {
        _log.debug('LOOM STATUS: ' + res.statusCode);
        _log.debug('LOOM HEADERS: ' + JSON.stringify(res.headers));
        res.setEncoding('utf8');
        res.on('data', function(chunk) {
          _log.debug('LOOM BODY: ' + chunk);
        });

        // start the consumer for our stream id
        var streamId = res.headers['x-stream-id'];

        _log.info({sid: streamId}, 'Loom stream id');

        // _log.debug({curl: `curl -i --no-buffer ${config.url}/stream/${streamId}`},
        //           "Loom client started, stream: ")
      };

      _log.info({metadata, id: opts.id}, 'Initializing loom client with metadata');

      if (opts.id) {
        opts.id = require('querystring').escape(opts.id);
      }

      /* eslint-disable quote-props, lines-around-comment */
      var headers = {
        connection: 'keep-alive',
        'x-stream-metadata': JSON.stringify(metadata),
      };
      /* eslint-enable quote-props, lines-around-comment */

      if (config.token) {
        headers.authorization = `Bearer ${config.token}`;
      }

      var loom = http.request({
        hostname: url.parse(config.url).hostname,
        port: url.parse(config.url).port,
        method: 'post',
        path: '/stream' + (opts.id ? `/${opts.id}` : '') + (opts.force ? '?force=true' : ''),
        headers: headers,
      }, loomHandler);

      // disable connection timeout: let the output flow for as long as it wants
      loom.setTimeout(0);

      loom.on('error', function(err) {
        _log.warn({err, id: opts.id}, 'Loom socket closed');
      });

      return loom;
    },
  };
}

module.exports = createClient;
