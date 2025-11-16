'use strict';

class DatabaseSetup {

  constructor(database, options) {
    this.script = [];
    this.database = database;
    this.options = options;
  }

  go() {
    // If we have a database file, then we can do the import as configured.
    // If not, then skip it.
    if (this.options.database) {
      this.configureDatabase();
      this.restartDatabase();
      this.pingDatabase();
      this.createDatabase();
      this.importDatabase();
      return this.script;
    }
  }

  configureDatabase() {
    switch (this.database) {
      case 'mysql':
        this.mysqlDatabaseConfiguration();
        break;
      case 'mariadb':
        this.mariadblDatabaseConfiguration();
        break;
      case 'postgresql':
        // PostgreSQL configuration would go here
        break;
      case 'mssql':
        // MSSQL configuration would go here
        break;
    }
  }

  pingDatabase() {
    let script = [];
    // Ping the database to check if it's alive
    switch (this.database) {
      case 'mysql':
        this.script = this.script.push('READY=0; MYSQL_ALIVE=`mysqladmin ping`; while [ "$MYSQL_ALIVE" != "mysqld is alive" ] && [ $READY -lt 60 ]; do echo "Waiting for MySQL..."; service mysql start; READY=$((READY + 1)); sleep 1; MYSQL_ALIVE=`mysqladmin ping`; done; if [ "$MYSQL_ALIVE" != "mysqld is alive" ]; then echo "MySQL failed to start!"; exit 1; fi;');
        break;
      case 'mariadb':
        this.script = this.script.push('READY=0; MARIADB_ALIVE=`mariadb-admin ping`; while [ "$MARIADB_ALIVE" != "mysqld is alive" ] && [ $READY -lt 60 ]; do echo "Waiting for MariaDB..."; service mariadb start; READY=$((READY + 1)); sleep 1; MARIADB_ALIVE=`mariadb-admin ping`; done; if [ "$MARIADB_ALIVE" != "mysqld is alive" ]; then echo "MariaDB failed to start!"; exit 1; fi;');
        break;
      case 'postgresql':
        script = script.push('pg_isready');
        break;
      case 'mssql':
        script = script.push('sqlcmd -S localhost -Q "SELECT 1"');
        break;
    }
    return script;
  }

  createDatabase() {
    switch (this.database) {
      case 'mysql':
        this.createMysqlDatabase();
        break;
      case 'mariadb':
        this.createMariadbDatabase();
        break;
      case 'postgresql':
        this.createPostgresqlDatabase();
        break;
      case 'mssql':
        this.createMssqlDatabase();
        break;
    }
  }

  importDatabase() {
    switch (this.database) {
      case 'mysql':
        this.importMysqlDatabase();
        break;
      case 'mariadb':
        this.importMysqlDatabase();
        break;
      case 'postgresql':
        this.importPostgresqlDatabase();
        break;
      case 'mssql':
        this.importMssqlDatabase();
        break;
    }
  }

  importMysqlDatabase() {
    if (this.options.database) {
      this.script = this.script.concat(['echo "Importing database."']);
      let databaseImportBase = '';
      if (this.options.databaseGzipped) {
        databaseImportBase =
          'gunzip -c $ASSET_DIR/' + this.options.database + ' |';
      } else if (this.options.databaseBzipped) {
        databaseImportBase =
          'bunzip2 -c $ASSET_DIR/' + this.options.database + ' | ';
      } else {
        databaseImportBase = 'cat $ASSET_DIR/' + this.options.database + ' | ';
      }
      this.script.push(
        `${databaseImportBase} $(mysql -u $DATABASE_USER --password=$DATABASE_PASS $DATABASE_NAME);`
      );
      this.script.push(`rm $ASSET_DIR/${this.options.database};`);
    }
  }

  importMariadbDatabase() {
    if (this.options.database) {
      this.script = this.script.concat(['echo "Importing database."']);
      let databaseImportBase = '';
      if (this.options.databaseGzipped) {
        databaseImportBase =
          'gunzip -c $ASSET_DIR/' + this.options.database + ' |';
      } else if (this.options.databaseBzipped) {
        databaseImportBase =
          'bunzip2 -c $ASSET_DIR/' + this.options.database + ' | ';
      } else {
        databaseImportBase = 'cat $ASSET_DIR/' + this.options.database + ' | ';
      }
      this.script.push(
        `${databaseImportBase} $(mariadb -u $DATABASE_USER --password=$DATABASE_PASS $DATABASE_NAME);`
      );
      this.script.push(`rm $ASSET_DIR/${this.options.database};`);
    }
  }

  createMysqlDatabase() {
    this.script = this.script.concat([
      "echo 'Creating MySQL Database, user and granting access.'",
      'DATABASE_NAME=' + this.options.databaseName,
      'DATABASE_USER=' + this.options.databaseUser,
      'DATABASE_PASS=' + this.options.databasePass,
      // Set db credentials if found.
      'if [ -e $ASSET_DIR/credentials.sh ]; then source $ASSET_DIR/credentials.sh; fi',
      'mysql < /mysql-setup.sql',
      "mysql -e 'create database '$DATABASE_NAME",
      'if [ "$DATABASE_USER" != "root" ]; then mysql -e \'create user "\'$DATABASE_USER\'"@"localhost" identified by "\'$DATABASE_PASS\'"\'; fi',
      "mysql -e 'grant all on '$DATABASE_NAME'.* to \"'$DATABASE_USER'\"@\"localhost\"'",
      "mysql -e 'flush privileges'",
    ]);
  }

  createMariadbDatabase() {
    this.script = this.script.concat([
      "echo 'Creating MariaDB Database, user and granting access.'",
      'DATABASE_NAME=' + this.options.databaseName,
      'DATABASE_USER=' + this.options.databaseUser,
      'DATABASE_PASS=' + this.options.databasePass,
      // Set db credentials if found.
      'if [ -e $ASSET_DIR/credentials.sh ]; then source $ASSET_DIR/credentials.sh; fi',
      'mariadb < /mysql-setup.sql',
      "mariadb -e 'create database '$DATABASE_NAME",
      'if [ "$DATABASE_USER" != "root" ]; then mysql -e \'create user "\'$DATABASE_USER\'"@"localhost" identified by "\'$DATABASE_PASS\'"\'; fi',
      "mariadb -e 'grant all on '$DATABASE_NAME'.* to \"'$DATABASE_USER'\"@\"localhost\"'",
      "mariadb -e 'flush privileges'",
    ]);
  }

  mysqlDatabaseConfiguration() {
    let script = [];
    const options = this.options.dbOptions;
    script = script.concat(
      'echo "!include /etc/mysql/probo-settings.cnf" >> /etc/mysql/my.cnf'
    );
    script = script.concat(
      'echo "[mysqld]" > /etc/mysql/probo-settings.cnf'
    );
    if (!this.isEmptyObject(options)) {
      for (var key in options) {
        if (options.hasOwnProperty(key)) {
          var val = this.sanitizeValue(options[key]);
          script = this.script.concat(
            `echo "${key}=${val}" >> /etc/mysql/probo-settings.cnf`
          );
        }
      }
    }
  }

  mariadbDatabaseConfiguration() {
    let script = [];
    const options = this.options.dbOptions;
    script = script.concat(
      'echo "!include /etc/mysql/probo-settings.cnf" >> /etc/mysql/my.cnf'
    );
    script = script.concat(
      'echo "[mariadb]" > /etc/mysql/probo-settings.cnf'
    );
    if (!this.isEmptyObject(options)) {
      for (var key in options) {
        if (options.hasOwnProperty(key)) {
          var val = this.sanitizeValue(options[key]);
          script = this.script.concat(
            `echo "${key}=${val}" >> /etc/mysql/probo-settings.cnf`
          );
        }
      }
    }
  }

  // Reload our database based on which database that is. This is sometimes required
  // when configurations are changed and need reloading.
  restartDatabase() {
    switch (this.database) {
      case 'mysql':
        this.script = this.script.push('service mysql restart');
        break;
      case 'mariadb':
        this.script = this.script.push('service mariadb restart');
        break;
      case 'postgresql':
      case 'mssql':
      default:
        // No restart needed for other databases
        break;
    }
  }

  isEmptyObject(o) {
    return !Object.keys(o).length;
  }

  sanitizeValue(val) {
    if (typeof val === 'string') {
      val = val.replace(/'/g, "\\'");
      val = val.replace(/"/g, '\\"');
      val = "'" + val + "'";
    }
    return val;
  }
}

module.exports = DatabaseSetup;
