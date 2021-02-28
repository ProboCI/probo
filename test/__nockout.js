'use strict';

const nock = require('nock');

// NOCK CONFIGUATION
// opts: {processor, not_required}
function initNock(opts) {

  let nocked = {};
  let requiredNocks = [];

  opts = opts || {};
  opts.not_required = opts.not_required || [];

  let nocks = [];

  if (opts.processor) {
    let ret = opts.processor(nocks);
    if (typeof ret != 'undefined') {
      nocks = ret;
    }
  }

  nocks.forEach((n, i) => {
    nocked[n.name || 'loaded_' + i] = n;
  });

  // Allows some mocks to be not required
  Object.keys(nocked)
    .filter(name => {
      return opts.not_required.indexOf(name) < 0;
    })
    .forEach(name => {
      requiredNocks.push(nocked[name]);
    });

  return {
    nock: nock,
    nocked: nocked,
    nocks: nocks,
    required: requiredNocks,
    cleanup: () => {
      // Makes sure all internal calls were made
      try {
        for (let nockName in requiredNocks) {
          if (requiredNocks.hasOwnProperty(nockName)) {
            requiredNocks[nockName].done();
          }
        }
      }
      finally {
        nock.cleanAll();
      }
    },
  };
}

module.exports = initNock;
