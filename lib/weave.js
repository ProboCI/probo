var http = require('http')
var url = require('url')

/**
 * Create a weave client
 * @param {Object} config
 * @param {Object} config.weave - Weave configuration - url
 * @param {Object} config.weave.url - Weave url
 * @param {Logger} [log] - Bunyan logger instance
 */
function createClient(config, log){
  config = config || {}
  if(!config.url){
    throw new Exception("url config require for weave client")
  }

  log = log ? log.child({component: 'weave'}) : require('./logger').getLogger("weave")

  log.info({config}, "configuring weave")

  return {
    config: config,
    createLogStream: function(metadata, opts){
      var _log = opts.log ? log.child({component: 'weave'}) : log

      var weave_handler = function(res){
        _log.debug('WEAVE STATUS: ' + res.statusCode);
        _log.debug('WEAVE HEADERS: ' + JSON.stringify(res.headers));
        res.setEncoding('utf8');
        res.on('data', function (chunk) {
          _log.debug('WEAVE BODY: ' + chunk);
        });

        // start the consumer for our stream id
        var streamId = res.headers['x-stream-id']

        _log.info({sid: streamId}, "Weave stream id")

        // _log.debug({curl: `curl -i --no-buffer ${config.url}/stream/${streamId}`},
        //           "Weave client started, stream: ")
      }

      _log.info({metadata, id: opts.id}, "Initializing weave client with metadata")

      var weave = http.request({
        hostname: url.parse(config.url).hostname,
        port: url.parse(config.url).port,
        method: 'post',
        path: '/stream' + opts.id ? `/${opts.id}` : '' + opts.force ? '?force=true' : '',
        headers: {
          connection: 'keep-alive',
          'x-stream-metadata': JSON.stringify(metadata)
        }
      }, weave_handler)

      // disable connection timeout: let the output flow for as long as it wants
      weave.setTimeout(0)

      weave.on("error", function(err){
        _log.warn({err: err}, "Weave socket closed")
      })

      return weave
    }
  }
}

module.exports = createClient
