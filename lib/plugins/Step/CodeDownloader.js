'use strict';
var downloaders = require('./CodeDownloader');

class CodeDownloader {

  constructor(container, options, project) {
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

  }
}

module.exports = CodeDownloader;
