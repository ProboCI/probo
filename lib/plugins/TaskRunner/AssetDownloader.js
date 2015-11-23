'use strict';

module.exports = class AssetDownloader extends require('./Script') {
  /**
   * options (used by this task):
   *   - assetServerUrl: URL (protocol, server and port) of asset server
   *   - assetBucket: asset bucket
   *   - assets: array of assets to download. Each asset is a string (same id and filename) or
   *             a {asset id: filename} object
   *
   */
  constructor(container, options) {
    super(container, options);

    // don't do anything if there aren't any assets or bucket specified
    if (!options.assetBucket || !options.assets) {
      return this;
    }

    // filter out asset tokens
    options.secrets = [
      options.assetBucket
    ];

    var script = [
      'mkdir -p $ASSET_DIR',
      'cd $ASSET_DIR',
    ];

    // normalize each asset definition into {id, name}
    this.assets = options.assets.map(this.normalizeAsset);

    // create a download command for every asset
    var commands = this.assets.map(this.createAssetDownloadCommand.bind(this));

    script = script.concat(commands);

    this.setScript(script);  // Script::setScript()
  }

  /**
   * Takes a string or an {id: filename} object and returns an object with
   * {id: id, name: name} mapping
   */
  normalizeAsset(asset) {
    var id, name;

    if (typeof asset == 'string') {
      id = name = asset;
    } else {
      id = Object.keys(asset)[0];
      name = asset[id];
    }

    return {id, name};
  }

  createAssetDownloadCommand(asset) {
    var url = this.options.assetServerUrl;
    var bucket = this.options.assetBucket;
    return `wget -nv -O ${asset.name} ${url}/asset/${bucket}/${asset.id}`;
  }

  description() {
    var ids = this.assets.map(function(a) {return a.id;}).join(', ');
    return `${this.plugin} ${ids}`;
  }
};
