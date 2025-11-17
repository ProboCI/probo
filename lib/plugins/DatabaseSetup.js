'use strict';

module.exports = function databaseSetup(database, options) {
  // If we have a database file, then we can do the import as configured.
  // If not, then skip it.
  let script = [];
  if (options.database) {
    script = script.concat(configureDatabase(database, options));
    console.log('----------');
    console.log(script);
    script = script.concat(restartDatabase(database, options));
    console.log('----------');
    console.log(script);
    script = script.concat(pingDatabase(database));
    console.log('----------');
    console.log(script);
    script = script.concat(createDatabase(database, options));
    console.log('----------');
    console.log(script);
    script = script.concat(importDatabase(database, options));
  }
  console.log('----------');
  console.log(script);
  process.exit(1);
  return script;
}

function configureDatabase(database, options) {
  let script = [];
  switch (database) {
    case 'mysql':
      script = mysqlDatabaseConfiguration(options);
      break;
    case 'mariadb':
      script = mariadbDatabaseConfiguration(options);
      break;
    case 'postgresql':
      // PostgreSQL configuration would go here
      break;
    case 'mssql':
      // MSSQL configuration would go here
      break;
  }
  return script;
}

function pingDatabase(database) {
  let script = [];  // Ping the database to check if it's alive
  switch (database) {
    case 'mysql':
      script.push('READY=0; MYSQL_ALIVE=`mysqladmin ping`; while [ "$MYSQL_ALIVE" != "mysqld is alive" ] && [ $READY -lt 60 ]; do echo "Waiting for MySQL..."; service mysql start; READY=$((READY + 1)); sleep 1; MYSQL_ALIVE=`mysqladmin ping`; done; if [ "$MYSQL_ALIVE" != "mysqld is alive" ]; then echo "MySQL failed to start!"; exit 1; fi;');
      break;
    case 'mariadb':
      script.push('READY=0; MARIADB_ALIVE=`mariadb-admin ping`; while [ "$MARIADB_ALIVE" != "mysqld is alive" ] && [ $READY -lt 60 ]; do echo "Waiting for MariaDB..."; service mariadb start; READY=$((READY + 1)); sleep 1; MARIADB_ALIVE=`mariadb-admin ping`; done; if [ "$MARIADB_ALIVE" != "mysqld is alive" ]; then echo "MariaDB failed to start!"; exit 1; fi;');
      break;
    case 'postgresql':
      script.push('pg_isready');
      break;
    case 'mssql':
      script.push('sqlcmd -S localhost -Q "SELECT 1"');
      break;
  }
  return script;
}

function createDatabase(database, options) {
  let script = [];
  switch (database) {
    case 'mysql':
      script = script.concat(createMysqlDatabase(options));
      break;
    case 'mariadb':
      script = script.concat(createMariadbDatabase(options));
      break;
    case 'postgresql':
      script = script.concat(createPostgresqlDatabase(options));
      break;
    case 'mssql':
      script = script.concat(createMssqlDatabase(options));
      break;
  }
  return script;
}

function importDatabase(database, options) {
  let script = [];
  switch (database) {
    case 'mysql':
      script = script.concat(importMysqlDatabase(options));
      break;
    case 'mariadb':
      script = script.concat(importMariadbDatabase(options));
      break;
    case 'postgresql':
      script = script.concat(importPostgresqlDatabase(options));
      break;
    case 'mssql':
      script = script.concat(importMssqlDatabase(options));
      break;
  }
  return script;
}

function importPostgresqlDatabase(options) {
  return [];
}

function importMssqlDatabase(options) {
  return [];
}

function importMysqlDatabase(options) {
  let script = [];
  script = script.concat(['echo "Importing database."']);
  let databaseImportBase = '';
  if (options.databaseGzipped) {
    databaseImportBase =
      'gunzip -c $ASSET_DIR/' + options.database + ' |';
  } else if (this.options.databaseBzipped) {
    databaseImportBase =
      'bunzip2 -c $ASSET_DIR/' + options.database + ' | ';
  } else {
    databaseImportBase = 'cat $ASSET_DIR/' + options.database + ' | ';
  }
  script.push(
    `${databaseImportBase} $(mysql -u $DATABASE_USER --password=$DATABASE_PASS $DATABASE_NAME);`
  );
  script.push(`rm $ASSET_DIR/${options.database};`);
  return script;
}

function importMariadbDatabase(options) {
  let script = [];
  script = script.concat(['echo "Importing database."']);
  let databaseImportBase = '';
  if (options.databaseGzipped) {
    databaseImportBase =
      'gunzip -c $ASSET_DIR/' + this.options.database + ' |';
  } else if (this.options.databaseBzipped) {
    databaseImportBase =
      'bunzip2 -c $ASSET_DIR/' + this.options.database + ' | ';
  } else {
    databaseImportBase = 'cat $ASSET_DIR/' + this.options.database + ' | ';
  }
  script.push(
    `${databaseImportBase} $(mariadb -u $DATABASE_USER --password=$DATABASE_PASS $DATABASE_NAME);`
  );
  script.push(`rm $ASSET_DIR/${this.options.database};`);
  return script;
}

function createMysqlDatabase(options) {
  let script = [];
  script = script.concat([
    "echo 'Creating MySQL Database, user and granting access.'",
    'DATABASE_NAME=' + options.databaseName,
    'DATABASE_USER=' + options.databaseUser,
    'DATABASE_PASS=' + options.databasePass,
    // Set db credentials if found.
    'if [ -e $ASSET_DIR/credentials.sh ]; then source $ASSET_DIR/credentials.sh; fi',
    'mysql < /mysql-setup.sql',
    "mysql -e 'create database '$DATABASE_NAME",
    'if [ "$DATABASE_USER" != "root" ]; then mysql -e \'create user "\'$DATABASE_USER\'"@"localhost" identified by "\'$DATABASE_PASS\'"\'; fi',
    "mysql -e 'grant all on '$DATABASE_NAME'.* to \"'$DATABASE_USER'\"@\"localhost\"'",
    "mysql -e 'flush privileges'",
  ]);
  return script;
}

function createMariadbDatabase(options) {
  let script = [];
  script = script.concat([
    "echo 'Creating MariaDB Database, user and granting access.'",
    'DATABASE_NAME=' + options.databaseName,
    'DATABASE_USER=' + options.databaseUser,
    'DATABASE_PASS=' + options.databasePass,
    // Set db credentials if found.
    'if [ -e $ASSET_DIR/credentials.sh ]; then source $ASSET_DIR/credentials.sh; fi',
    'mariadb < /mysql-setup.sql',
    "mariadb -e 'create database '$DATABASE_NAME",
    'if [ "$DATABASE_USER" != "root" ]; then mysql -e \'create user "\'$DATABASE_USER\'"@"localhost" identified by "\'$DATABASE_PASS\'"\'; fi',
    "mariadb -e 'grant all on '$DATABASE_NAME'.* to \"'$DATABASE_USER'\"@\"localhost\"'",
    "mariadb -e 'flush privileges'",
  ]);
  return script;
}

function mysqlDatabaseConfiguration() {
  let script = [];
  const options = this.options.dbOptions;
  script = script.concat(
    'echo "!include /etc/mysql/probo-settings.cnf" >> /etc/mysql/my.cnf'
  );
  script = script.concat(
    'echo "[mysqld]" > /etc/mysql/probo-settings.cnf'
  );
  if (!isEmptyObject(options)) {
    for (var key in options) {
      if (options.hasOwnProperty(key)) {
        var val = sanitizeValue(options[key]);
        script = this.script.concat(
          `echo "${key}=${val}" >> /etc/mysql/probo-settings.cnf`
        );
      }
    }
  }
}

function mariadbDatabaseConfiguration() {
  let script = [];
  const options = this.options.dbOptions;
  script = script.concat(
    'echo "!include /etc/mysql/probo-settings.cnf" >> /etc/mysql/my.cnf'
  );
  script = script.concat(
    'echo "[mariadb]" > /etc/mysql/probo-settings.cnf'
  );
  if (!isEmptyObject(options)) {
    for (var key in options) {
      if (options.hasOwnProperty(key)) {
        var val = sanitizeValue(options[key]);
        script = this.script.concat(
          `echo "${key}=${val}" >> /etc/mysql/probo-settings.cnf`
        );
      }
    }
  }
}

// Reload our database based on which database that is. This is sometimes required
// when configurations are changed and need reloading.
function restartDatabase(database, options) {
  let script = [];
  switch (database) {
    case 'mysql':
      script.push('service mysql restart');
      break;
    case 'mariadb':
      script.push('service mariadb restart');
      break;
    case 'postgresql':
    case 'mssql':
    default:
      // No restart needed for other databases
      break;
  }
}

function isEmptyObject(o) {
  return !Object.keys(o).length;
}

function sanitizeValue(val) {
  if (typeof val === 'string') {
    val = val.replace(/'/g, "\\'");
    val = val.replace(/"/g, '\\"');
    val = "'" + val + "'";
  }
  return val;
}
