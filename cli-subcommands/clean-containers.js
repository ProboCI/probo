'use strict';

var co = require('co');
var read = require('co-read');
var through = require('through2');
var JSONStream = require('JSONStream');
var GitHubApi = require('github');
var Promise = require('bluebird');

var Container = require('../lib/Container');

var github = new GitHubApi({
  version: '3.0.0',
  headers: {
    // GitHub requires a unique user agent
    'user-agent': 'Probo'
  },
});
Promise.promisifyAll(github.pullRequests);

var probo_config; // will be filled in on startup


var exports = function() {
  this.configure = this.configure.bind(this);
  this.run = this.run.bind(this);
};

exports.shortDescription = 'Cleans up old containers. Leaves 1 container per project per pull request.';

exports.help = 'Cleans up obsolete containers';

exports.options = function(yargs) {
  return yargs
    .describe('data-dir', 'The directory where leveldb data is stored.')
    .alias('data-dir', 'd')
  ;
};

function* get_builds(cm) {
  // convert DB readStream to a real stream with objects. not efficient, but this is utility code
  var buildStream = cm.streamFromDB('builds').pipe(new JSONStream.stringify()).pipe(new JSONStream.parse('*'));

  // parse out just what we need and filter
  buildStream = buildStream.pipe(through.obj(function(build, enc, callback) {
    if (build.container) {
      this.push({
        id: build.id,
        ref: build.ref,
        project: build.project,
        container: build.container,
        createdAt: build.createdAt,
      });
    }

    callback();
  }));

  var build, builds = [];
  while ((build = yield read(buildStream))) {
    builds.push(build);
  }

  return builds;
}

function builds_to_projects(builds) {
  var projects = {};

  for (let build of builds) {
    // console.log(JSON.stringify(build, null, 2))
    let project = projects[build.project.slug];
    if (!project) {
      project = projects[build.project.slug] = build.project;
      project.builds = [];
    }
    delete build.project;
    project.builds.push(build);
  }

  // turn projects back into an array
  var project_array = [];
  for (let project_name in projects) {
    project_array.push(projects[project_name]);
  }

  return project_array;
}

function* get_container_names_for_project(project) {
  let container = new Container({
    docker: probo_config.docker
  });
  let docker = Promise.promisifyAll(container.docker);
  let containers = yield docker.listContainersAsync({all: true});

  // filter containers by only the probo ones
  let container_names = containers.map(function(c) {
    return c.Names[0].substr(1);
  }).filter(function(name) {
    return name.indexOf(`probo--${project.name.replace('/', '.')}--${project.id}`) === 0;
  });

  return container_names;
}


function* start() {
  // list all builds
  var cm = new this.probo.ContainerManager();
  cm.configure(this.probo.config, function() {});

  var builds = yield* get_builds(cm);
  var projects = builds_to_projects(builds);

  // now we have projects with builds
  // console.log(JSON.stringify(projects, null, 2))

  var github_projects = projects.filter(function(p) {
    return p.provider.slug === 'github';
  });

  for (let project of github_projects) {
    github.authenticate({type: 'oauth', token: project.service_auth.token});

    // console.log(project)

    // get list of open pull requests for each project
    var pull_requests = yield github.pullRequests.getAllAsync({
      user: project.owner,
      repo: project.repo,
      state: 'open',
    });

    var latest_shas = pull_requests.map(function(pr) { return pr.head.sha; });

    // find build containers not matching the latest sha
    function contains(haystack, needle) { return haystack.indexOf(needle) >= 0; }
    var old_builds = project.builds.filter(function(build) {
      return !contains(latest_shas, build.ref);
    }).map(function(build) { return build.container.name; });
    var current_builds = project.builds.filter(function(build) {
      return contains(latest_shas, build.ref);
    }).map(function(build) { return build.container.name; });

    console.log('old builds', old_builds.length, old_builds);
    console.log('current builds', current_builds.length, current_builds);

    console.log('attempting to stop/kill all old containers...');

    for (let container_name of old_builds) {
      console.log(container_name);

      let container = new Container({
        docker: this.probo.config.docker,
        containerId: container_name,
      });

      Promise.promisifyAll(container.container);

      try {
        let res = yield container.container.removeAsync({force: true, v: true}); // volumes too
        console.log(`container ${container_name} REMOVED`);
      }
      catch (e) {
        if (e.statusCode === 404) {
          // container is already gone
          console.log(`container ${container_name} already REMOVED`);
        }
        else {
          console.log(`container ${container_name} FAILED: ${e.message}`);
        }
      }
    }
    console.log('all old containers removed!');

    var existing_probo_containers = yield* get_container_names_for_project(project);

    console.log('all exitsing containers:', existing_probo_containers);

    // find containers that should not be in the active list
    let bad_containers = existing_probo_containers.filter(function(name) {
      return contains(old_builds, name);
    });

    let good_containers = existing_probo_containers.filter(function(name) {
      return !contains(old_builds, name);
    });

    console.log('containers to be deleted:', bad_containers);
    console.log('containers to be kept:', good_containers);
  }
}



exports.run = co.wrap(function* (probo) {
  // disable bunyan output
  var logger = (require('../lib/logger')).getLogger();
  logger._level = Number.POSITIVE_INFINITY;

  probo_config = probo.config;

  try {
    yield start.apply({probo});
  }
  catch (e) {
    console.error(e.stack);
  }
});

module.exports = exports;
