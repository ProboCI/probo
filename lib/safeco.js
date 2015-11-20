var co = require('co');

var wrapco = function(handler) {
  return function(gen, opts) {
    opts = opts || {};

    return co(gen).catch(function(error) {
      // be totally safe in case handler errors out
      try {
        handler.call(opts.ctx, error, opts);
      } catch (e) {
        console.error('ERROR: Safeco error handler threw:', e.stack);
      }
    });
  };
};

module.exports = function(gen, opts) {
  var handler;
  if (isGeneratorFunction(gen)) {
    // using safeco on a generator, proceed with the default handler
    handler = function(err) {
      console.error('Unhanded co Error', err.stack);
    };
    return wrapco(handler)(gen, opts);
  } else {
    // a custom handler is passed in, return the wrapper
    handler = gen;
    return wrapco(handler);
  }
};


/**
 * Check if `obj` is a generator.
 *
 * @param {Mixed} obj
 * @return {Boolean}
 * @api private
 */

function isGenerator(obj) {
  return 'function' == typeof obj.next && 'function' == typeof obj.throw;
}

/**
 * Check if `obj` is a generator function.
 *
 * @param {Mixed} obj
 * @return {Boolean}
 * @api private
 */
function isGeneratorFunction(obj) {
  var constructor = obj.constructor;
  if (!constructor) return false;
  if ('GeneratorFunction' === constructor.name || 'GeneratorFunction' === constructor.displayName) return true;
  return isGenerator(constructor.prototype);
}
