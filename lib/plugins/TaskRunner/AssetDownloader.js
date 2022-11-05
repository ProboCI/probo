'use strict';

module.exports = class AssetDownloader extends require('./Script') {

  /**
   * @param {object} container - The dockerode docker container object.
   * @param {object} options - Options used by this task.
   * @param {object} options.url - URL (protocol, server and port) of assets server
   * @param {object} [options.token] - API token for assets server
   * @param {object} options.bucket - asset bucket
   * @param {object} options.assets - array of assets to download. Each asset is a string (same id and filename) or a {asset id: filename} object
   * @return {object} - This object.
   */
  constructor(container, options) {
    super(container, options);

    // don't do anything if there aren't any assets or bucket specified
    if (!options.bucket || !options.assets) {
      return this;
    }

    // filter out asset tokens
    options.secrets = [options.bucket, options.token, options.url];

    var script = ['mkdir -p $ASSET_DIR', 'cd $ASSET_DIR'];

    // Normalize each asset definition into {id, name}.
    this.assets = options.assets.map(this.normalizeAsset);

    // Create a download command for every asset.
    var commands = this.assets.map(this.createAssetDownloadCommand.bind(this));

    script = script.concat(commands);

    // Script::setScript()
    this.setScript(script);
  }

  /**
   * @param {mixed} asset - Takes a string or an {id: filename} object.
   * @return {object} - The {id: id, name: name} mapping.
   */
  normalizeAsset(asset) {
    var id;
    var name;

    if (typeof asset == 'string') {
      id = name = asset;
    }
    else {
      id = Object.keys(asset)[0];
      name = asset[id];
    }

    return {id, name};
  }

  createAssetDownloadCommand(asset) {
    var url = this.options.url;
    var bucket = this.options.bucket;
    var auth = this.options.token
      ? `--header='Authorization:Bearer ${this.options.token}'`
      : '';

    return `wget -nv -O ${asset.name} ${auth} ${url}/asset/${bucket}/${asset.id}`;
  }

  description() {
    var ids = this.assets
      .map(function(a) {
        return a.id;
      })
      .join(', ');
    return `${this.plugin} ${ids}`;
  }
};
