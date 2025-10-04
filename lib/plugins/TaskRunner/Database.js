'use strict';

module.exports = class Database extends require('./Script') {
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

    const parts = options.database.split(':');
    const daemon = parts[0];
    const version = parts[1];
    var script = [];
    if (daemon === 'mysql') {
      if (version === '8.0') {
        script.push('cd /opt/mysql && expect ./mysql8.0.exp');
        script.push('apt update');
        script.push('DEBIAN_FRONTEND=noninteractive apt install -y mysql-server-8.0 mysql-client-8.0');
      } else if (version === '8.4') {
        script.push('cd /opt/mysql && expect ./mysql8.4.exp');
        script.push('apt update');
        script.push('DEBIAN_FRONTEND=noninteractive apt install -y mysql-server mysql-client');
      }
      script.push('service mysql enable');
      script.push('service mysql start');
      script.push('cd');
    } else if (daemon === 'mariadb') {
      
    } else if (daemon === 'postgres') {
      
    } else {
      throw new Error('Unsupported database daemon: ' + daemon);
    }

    this.setScript(script);
  }

};
