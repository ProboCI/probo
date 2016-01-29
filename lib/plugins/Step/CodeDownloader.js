'use strict';
// TODO: We'll need some way to provide various various
var downloaders = require('./CodeDownloaders');

class CodeDownloader {

  constructor(container, options) {
    var provider = options.build.project.provider.type;
    var Plugin = this.getPlugin(provider);
    return new Plugin(container, options);
  }

  getPlugin(type) {

    var plugins = {
      github: downloaders.GithubDownloader,
      stash: downloaders.StashDownloader,
      bitbucket: downloaders.BitbucketDownloader,
    };

    var plugin = plugins[type];
    if (!plugin) {
      throw new Error('Download: unsupported provider type: ' + type);
    }
    return plugin;

  }
}

module.exports = CodeDownloader;
