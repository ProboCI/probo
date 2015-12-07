// NOCK CONFIGUATION
// var default_nock_mode = "RECORD"
var default_nock_mode = "PLAY";

var nock = require('nock');
// opts: {processor, not_required, mode}
function init_nock(fixture, opts) {
  var fixture_file = './test/fixtures/' + fixture;

  var nocked = {};
  var required_nocks = [];

  opts = opts || {};
  opts.not_required = opts.not_required || [];

  var nock_mode = opts.mode || default_nock_mode;

  var nocks;
  if (nock_mode === 'PLAY') {
    nocks = nock.load(fixture_file);

    if (opts.processor) {
      var ret = opts.processor(nocks);
      if (typeof ret != 'undefined') {
        nocks = ret;
      }
    }

    nocks.forEach(function(n, i) {
      nocked[n.name || 'loaded_' + i] = n;
    });


    // allow some mocks to be not required
    Object.keys(nocked).filter(function(name) {
      return opts.not_required.indexOf(name) < 0;
    }).forEach(function(name) {
      required_nocks.push(nocked[name]);
    });
  }

  if (nock_mode === 'RECORD') {
    console.log('recording');
    nock.recorder.rec({
      output_objects: true,
      dont_print: true
    });
  }

  return {
    nock: nock,
    nocked: nocked,
    nocks: nocks,
    required: required_nocks,
    cleanup: function() {
      if (nock_mode === 'RECORD') {
        var nockCallObjects = nock.recorder.play();
        require('fs').writeFileSync(fixture_file, JSON.stringify(nockCallObjects, null, 2));
      }

      // makesure all internal calls were made
      try {
        for (var nock_name in required_nocks) {
          required_nocks[nock_name].done();
        }
      } finally {
        nock.cleanAll();
      }
    }
  };
}


module.exports = init_nock;
