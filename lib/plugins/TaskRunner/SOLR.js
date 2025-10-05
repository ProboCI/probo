'use strict';

module.exports = class SOLR extends require('./Script') {
  /**
   * @param {object} container - The dockerode docker container object.
   * @param {object} options - Options used by this task.
   */
  constructor(container, options) {
    super(container, options);

    let script = [];
    let url = null;
    const name = options.solr.name;
    const core_archive = options.solr.core_archive;
    const core_folder = options.solr.core_folder;
    const version = options.solr.version;
    const compression = options.solr.compression || 'targzip';

    if (core) {
      if (compression === 'zip') {
        script.push('cd $ASSET_DIR');
        script.push('unzip ' + core_archive);
      } else {
        script.push('cd $ASSET_DIR');
        script.push('tar -xzf ' + core_archive);
      }
    } else {
      script.push('echo "When using SOLR, you must provide a core configuration set as an asset. Please see the Probo.CI Documentation for more information');
      script.push('exit 1;');
    }

    const parts = version.split('.');
    if (parts[0] < 9) {
      url = 'https://archive.apache.org/dist/lucene/solr/' + version + '/solr-' + version + '.tgz';
    } else {
      url = 'https://archive.apache.org/dist/solr/solr/' + version + '/solr-' + version + '.tgz';
    }
    script.push('groupadd solr');
    script.push('useradd -r -g solr solr');

    script.push('cd /opt && wget -q ' + url);
    script.push('tar xzf solr-' + version + '.tgz solr-' + version + '/bin/install_solr_service.sh --strip-components=2');
    script.push('./install_solr_service.sh solr-' + version + '.tgz');
    script.push('sudo -u solr -- /opt/solr/bin/solr create -c ' + name + ' -n "$ASSET_DIR/' + core_folder + '"');
    script.push('rm solr-' + version + '.tgz');

    this.setScript(script);
  }

}