'use strict';

module.exports = class DrushFetcher extends require('./AbstractPlugin') {
  constructor(container, options) {
    super(container, options);
  }

  buildCommand() {
    var options = this.options;
    var command = [
      'drush',
      'fetch',
      options.name,
    ];
    var param = null;
    for (param in options.params) {
      if (options.params.hasOwnProperty(param)) {
        command.push('--' + param + '=' + options.params[param]);
      }
    }
    if (options.config) {
      command.push('--json-config=' + JSON.stringify(options.config));
    }

    return command;
  }
};
