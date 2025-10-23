'use strict';

module.exports = class SOLR extends require('./Script') {

  /**
   * @param {object} container - The dockerode docker container object.
   * @param {object} options - Options used by this task.
   */
  constructor(container, options) {
    super(container, options);

    let script = [];
    const name = options.solr.name;
    const core_archive = options.solr.core_archive;
    const core_folder = options.solr.core_folder;
    const version = options.solr.version;
    const compression = options.solr.compression || 'gzip';

    if (version < 5 || version > 9) {
      script.push('echo "SOLR version must be between 5 and 9"');
      script.push('exit 1;');
    } else {
      if (core_archive) {
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
    }

    const url = options.global.solr[version].url;
    const ver = options.global.solr[version].version;
    // sudo -u solr tar xzf solr-9.9.0.tgz solr-9.9.0/bin/install_solr_service.sh --strip-components=2
    // sudo -u solr /opt/solr/bin/solr create -c drupal -n /assets/solr9

    script.push('groupadd solr');
    script.push('useradd -r -g solr solr');

    script.push('cd /opt && wget -q ' + url);
    script.push('chown solr:solr /opt/solr-' + ver + '.tgz');
    script.push('chmod 777 /opt');

    script.push('tar xzf solr-' + ver + '.tgz solr-' + ver + '/bin/install_solr_service.sh --strip-components=2');
    script.push('./install_solr_service.sh solr-' + ver + '.tgz');
    script.push('echo \'SOLR_MODULES="analysis-extras"\' > /opt/solr/bin/solr.in.sh');
    script.push('chown -R solr:solr /opt/solr-' + ver);
    
    script.push('sudo -u solr /opt/solr/bin/solr restart');
    script.push('sudo -u solr /opt/solr/bin/solr restart');

    script.push('sudo -u solr /opt/solr/bin/solr create -c ' + name + ' -n "$ASSET_DIR/' + core_folder + '"');
    script.push('rm solr-' + ver + '.tgz');

    this.setScript(script);
  }

}