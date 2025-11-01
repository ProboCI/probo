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
        script.push('cd /opt && wget -q https://probosupportfiles.blob.core.windows.net/mysql/mysql-5.7.tar.gz');
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
      } else {
        script.push('echo "Not a valid version of MySQL. Only versions 5.7, 8.0 and 8.4 are valid entries for MySQL.');
        script.push('exit 1;');
      }
      script.push('service mysql restart');
      script.push('cd');
    } else if (daemon === 'mariadb') {
      if (version != '10.11' && version != '11.4' && version != '11.8') {
        script.push('echo "Not a valid version of MariaDB. Only versions 10.11, 11.4 and 11.8 are valid entries for MariaDB.');
        script.push('exit 1;');
      }
      script.push('curl -LsS https://r.mariadb.com/downloads/mariadb_repo_setup | sudo bash -s -- --mariadb-server-version="mariadb-' + version + '"');
      script.push('DEBIAN_FRONTEND=noninteractive apt install -y mariadb-server mariadb-client');
      script.push('mariadb -uroot --skip-password < /mysql-setup.sql');
      script.push('service mysql restart');
    } else if (daemon === 'postgresql' || daemon === 'postgres' || daemon === 'psql') {
      script.push('apt install -y postgresql-' + version);
      script.push('update-rc.d postgresql enable');
      script.push('service postgresql start');
      script.push('sudo -u postgres psql -c "ALTER USER postgres PASSWORD \'strongpassword\';"')
    } else if (daemon === 'mssql' || daemon === 'sqlserver') {
      script.push('curl -fsSL https://packages.microsoft.com/keys/microsoft.asc | sudo gpg --dearmor -o /usr/share/keyrings/microsoft-prod.gpg');
      script.push('curl -fsSL https://packages.microsoft.com/config/ubuntu/24.04/mssql-server-preview.list | sudo tee /etc/apt/sources.list.d/mssql-server-preview.list');
      script.push('apt update -y');
      script.push('ACCEPT_EULA=Y apt install -y mssql-server');
      script.push('curl -sSL -O https://packages.microsoft.com/config/ubuntu/24.04/packages-microsoft-prod.deb');
      script.push('dpkg -i packages-microsoft-prod.deb');
      script.push('MSSQL_SA_PASSWORD=Password77^^ ACCEPT_EULA=Y /opt/mssql/bin/sqlservr --accept-eula --setup');
    } else {
      script.push('echo "Invalid database. You can only use mariadb, mysql or postgresql.');
      script.push('exit 1;');
    }

    this.setScript(script);
  }

  description() {
    return 'Install Database';
  }

};
