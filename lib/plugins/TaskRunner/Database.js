'use strict';

module.exports = class Database extends require('./Script') {
  /**
   * @param {object} container - The dockerode docker container object.
   * @param {object} options - Options used by this task.
   * @return {object} - This object.
   */
  constructor(container, options) {
    super(container, options);

    const parts = options.database.split(':');
    const daemon = parts[0];
    const version = parts[1];
    let script = [];

    if (daemon === 'mysql') {
      if (version === '8.0') {
        script.push('cd /opt/mysql && expect ./mysql8.0.exp');
        script.push('apt update');
        script.push('DEBIAN_FRONTEND=noninteractive apt install -y mysql-server mysql-client');
      } else if (version === '8.4') {
        script.push('cd /opt/mysql && expect ./mysql8.4.exp');
        script.push('apt update');
        script.push('DEBIAN_FRONTEND=noninteractive apt install -y mysql-server mysql-client');
      } else if (version === '5.7') {
        script.push('cd /opt && wget -q https://proofroom.s3.amazonaws.com/mysql-5.7.tar.gz');
        script.push('tar -xzf mysql-5.7.tar.gz');
        script.push('rm mysql-5.7.tar.gz');
        script.push('groupadd mysql');
        script.push('useradd -r -g mysql -s /bin/false mysql');
        script.push('cd /var/lib && mkdir mysql && chown mysql:mysql mysql');
        script.push('chmod 750 mysql');
        script.push('mysqld --initialize-insecure --user=mysql');
        script.push('cp -f /opt/mysql/support-files/mysql.server /etc/init.d/mysql');
        script.push('service mysql start');
        script.push('mysql -uroot --skip-password < /mysql-setup.sql');
        script.push('service mysql restart');
        script.push('mysql -uprobo -pstrongpassword -e "GRANT ALL PRIVILEGES ON * . * TO root@localhost WITH GRANT OPTION;"');
        script.push('mysql -uprobo -pstrongpassword -e "GRANT ALL PRIVILEGES ON * . * TO root@127.0.0.1 WITH GRANT OPTION;"');
        script.push('mysql -uprobo -pstrongpassword -e "GRANT ALL PRIVILEGES ON * . * TO root@\'::1\'WITH GRANT OPTION;"');
        script.push('mysql -uprobo -pstrongpassword -e "FLUSH PRIVILEGES;"');
      }
      script.push('service mysql restart');
      script.push('cd');
    } else if (daemon === 'mariadb') {
      script.push('curl -LsS https://r.mariadb.com/downloads/mariadb_repo_setup | sudo bash -s -- --mariadb-server-version="mariadb-' + version + '"');
      script.push('DEBIAN_FRONTEND=noninteractive apt install -y mariadb-server mariadb-client');
      script.push('mariadb -uroot --skip-password < /mysql-setup.sql');
      script.push('service mysql restart');
    } else if (daemon === 'postgresql' || daemon === 'postgres' || daemon === 'psql') {
      script.push('apt install -y postgresql-' + version);
      script.push('update-rc.d postgresql enable');
      script.push('service postgresql start');
      script.push('sudo -u postgres psql -c "ALTER USER postgres PASSWORD \'strongpassword\';"')
    } else {
      throw new Error('Unsupported database daemon: ' + daemon);
    }

    this.setScript(script);
  }
};
