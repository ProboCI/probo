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
    'user-agent': 'Probo',
  },
});
Promise.promisifyAll(github.pullRequests);

// will be filled in on startup

var proboConfig;


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

function* getBuilds(cm) {
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

  var build = [];
  var builds = [];
  while ((build = yield read(buildStream))) {
    builds.push(build);
  }

  return builds;
}

function buildsToProjects(builds) {
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
  var projectArray = [];
  for (let projectName in projects) {
    projectArray.push(projects[projectName]);
  }

  return projectArray;
}

function* getContainerNamesForProject(project) {
  let container = new Container({
    docker: proboConfig.docker,
  });
  let docker = Promise.promisifyAll(container.docker);
  let containers = yield docker.listContainersAsync({all: true});

  // filter containers by only the probo ones
  let containerNames = containers.map(function(c) {
    return c.Names[0].substr(1);
  }).filter(function(name) {
    return name.indexOf(`probo--${project.name.replace('/', '.')}--${project.id}`) === 0;
  });

  return containerNames;
}


function* start() {
  // list all builds
  var cm = new this.probo.ContainerManager();
  cm.configure(this.probo.config, function() {});

  var builds = yield* getBuilds(cm);
  var projects = buildsToProjects(builds);

  // now we have projects with builds
  // console.log(JSON.stringify(projects, null, 2))

  var githubProjects = projects.filter(function(p) {
    return p.provider.slug === 'github';
  });

  for (let project of githubProjects) {
    github.authenticate({type: 'oauth', token: project.service_auth.token});

    // console.log(project)

    // get list of open pull requests for each project
    var pullRequests = yield github.pullRequests.getAllAsync({
      user: project.owner,
      repo: project.repo,
      state: 'open',
    });

    var latestShas = pullRequests.map(function(pr) { return pr.head.sha; });

    // find build containers not matching the latest sha
    function contains(haystack, needle) { 
      return haystack.indexOf(needle) >= 0; 
    }
    var oldBuilds = project.builds.filter(function(build) {
      return !contains(latestShas, build.ref);
    }).map(function(build) { return build.container.name; });
    var currentBuilds = project.builds.filter(function(build) {
      return contains(latestShas, build.ref);
    }).map(function(build) { return build.container.name; });

    console.log('old builds', oldBuilds.length, oldBuilds);
    console.log('current builds', currentBuilds.length, currentBuilds);

    console.log('attempting to stop/kill all old containers...');

    for (let containerName of oldBuilds) {
      console.log(containerName);

      let container = new Container({
        docker: this.probo.config.docker,
        containerId: containerName,
      });

      Promise.promisifyAll(container.container);

      try {
        // volumes too
        let res = yield container.container.removeAsync({force: true, v: true});
        console.log(`container ${containerName} REMOVED`);
      }
      catch (e) {
        if (e.statusCode === 404) {
          // container is already gone
          console.log(`container ${containerName} already REMOVED`);
        }
        else {
          console.log(`container ${containerName} FAILED: ${e.message}`);
        }
      }
    }
    console.log('all old containers removed!');

    var existingProboContainers = yield* getContainerNamesForProject(project);

    console.log('all exitsing containers:', existingProboContainers);

    // find containers that should not be in the active list
    let badContainers = existingProboContainers.filter(function(name) {
      return contains(oldBuilds, name);
    });

    let goodContainers = existingProboContainers.filter(function(name) {
      return !contains(oldBuilds, name);
    });

    console.log('containers to be deleted:', badContainers);
    console.log('containers to be kept:', goodContainers);
  }
}



exports.run = co.wrap(function* (probo) {
  // disable bunyan output
  var logger = (require('../lib/logger')).getLogger();
  logger._level = Number.POSITIVE_INFINITY;

  proboConfig = probo.config;

  try {
    yield start.apply({probo});
  }
  catch (e) {
    console.error(e.stack);
  }
});

module.exports = exports;
