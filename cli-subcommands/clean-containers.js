"use strict"

var co = require('co')
var read = require('co-read')
var through = require('through2')
var JSONStream = require('JSONStream')
var GitHubApi = require('github')
var Promise = require('bluebird')
var _ = require('lodash')
var request = require('request')
var requestAsync = require('request-promise')

var bytes = require('bytes')

var Container = require('../lib/Container')

var github = new GitHubApi({
  version: "3.0.0",
  headers: {
    // GitHub requires a unique user agent
    "user-agent": "Probo"
  }
});
Promise.promisifyAll(github.pullRequests)

var probo_config; // will be filled in on startup
var utils;        // defined at the bottom of the file

var exports = function() {
  this.configure = this.configure.bind(this);
  this.run = this.run.bind(this);
};

exports.shortDescription = 'Cleans up old containers. Leaves 1 container per project per pull request.'

exports.help = 'Cleans up obsolete containers';

exports.options = function(yargs) {
  return yargs
    .describe('data-dir', 'The directory where leveldb data is stored.')
    .alias('data-dir', 'd')
  ;
}

function* get_builds(cm){
  var buildStream = request(`http://${probo_config.hostname}:${probo_config.port}/builds`).pipe(new JSONStream.parse('*'))

  // parse out just what we need and filter
  buildStream = buildStream.pipe(through.obj(function(build, enc, callback){
    if(build.container){
      this.push({
        id: build.id,
        ref: build.ref,
        branch: build.branch,
        pullRequest: build.pullRequest,
        project: build.project,
        container: build.container,
        createdAt: build.createdAt
      })
      //this.push(build)
    }

    callback()
  }))

  var build, builds = []
  while((build = yield read(buildStream))){
    builds.push(build)
  }

  return builds
}

var pr_cache = {}
function* getGithubPRStatus(project, pr){
  if(!pr_cache[project.id]){
    github.authenticate({type: 'oauth', token: project.service_auth.token})

    var pull_requests = []
    try {
      // get list of pull requests for the project
      pull_requests = yield github.pullRequests.getAllAsync({
        user: project.owner,
        repo: project.repo,
        // state: 'open'
      })
    } catch (e){
      console.log(e)
    }

    // create a map from PR number to PR object
    pr_cache[project.id] = utils.indexBy(pull_requests, 'number')
  }

  return pr_cache[project.id][pr]
}


/**
 * Returns an array of projects.
 * Each project has .builds, .prs, and .branches arrays.
 * The builds array is all the builds for the project, sorted by createdAt date, descending.
 * The prs array is all the PRs, sorted by PR number, descending. Each object is {pr, builds, state}. State is GH info for the PR, if it's a GH project.
 * The branches array is all the builds for a particular branch, sorted by createdAt in descending order. Each object is {branch, builds}
 */
function* builds_to_projects(builds){
  var projects = {}

  for(let build of builds){
    // console.log(JSON.stringify(build, null, 2))
    let project = projects[build.project.slug]
    if(!project){
      project = projects[build.project.slug] = build.project

      // put builds into builds and PR and branch buckets
      project.builds = []
      project.pull_requests = []
      project.branches = []
    }
    delete build.project
    project.builds.push(build)

    // turn pr and branch into a string to avoid undefined values
    build.pullRequest = build.pullRequest + ""
    build.branch = build.branch + ""
  }

  let createdAt_desc = utils.sorter('createdAt', 'desc')

  // turn projects back into an array
  var project_array = []
  for(let project_name in projects){
    let project = projects[project_name]

    // sort the builds by descending start date
    project.builds.sort(createdAt_desc)

    // turn PRs into an array
    let prs = utils.indexBy(project.builds, 'pullRequest')
    // console.log(prs)
    for(let pr in prs){
      let pull_request = {
        pr: pr,
        builds: prs[pr],
      }
      if(project.provider.slug === 'github'){
        pull_request.state = yield* getGithubPRStatus(project, pr)
      }

      // sort the builds in the PR
      pull_request.builds.sort(createdAt_desc)

      project.pull_requests.push(pull_request)
    }

    // turn branches into an array
    let branches = utils.indexBy(project.builds, 'branch')
    for(let branch in branches){
      project.branches.push({
        branch: branch,
        // sort the builds in the branch
        builds: branches[branch].sort(createdAt_desc),  
      })
    }

    // sort by descending PR number
    project.pull_requests.sort(utils.sorter('pr', 'desc'))

    project_array.push(project)
    delete project._temp
  }

  return project_array
}

function* get_container_names_for_project(project){
  let response = JSON.parse(yield requestAsync(`http://${probo_config.hostname}:${probo_config.port}/containers`))

  let container_names = response.containers.filter(function(c){
    return c.name.indexOf(`probo--${project.name.replace('/', '.')}--${project.id}`) === 0
  }).map(function(c){
    return c.name
  })

  return container_names
}

function printBuilds(builds, indent){
  indent = indent || "\t"
  for(let build of builds){
    console.log(`${indent}Build ${build.createdAt} pr:${build.pullRequest} branch:${build.branch} container:${build.container.state}`)
  }
}

function printPRs(pull_requests, indent){
  indent = indent || "\t"
  for(let pr of pull_requests){
    console.log(`${indent}PR ${pr.pr} state: ${pr.state ? pr.state.state : "n/a"} [${pr.builds.length} builds]`)
    printBuilds(pr.builds, indent + "\t")
  }
}

function printBranches(branches, indent){
  indent = indent || "\t"
  for(let branch of branches){
    console.log(`\tBranch ${branch.branch} [${pr.builds.length} builds]`)
    printBuilds(pr.builds, indent + "\t")
  }
}

/**
 * Sets .container properties on the build with the status of the container. Values are:
 * state:
 *  null - if the docker container does not exist for the build
 *  "stopped" - if the docker container exists and is stopped
 *  "running" - if the docker container exists and is running
 * disk:
 *  .imageSize - size of the container's image in bytes, if container exists, null otherwise
 *  .containerSize - size of the container's ownlayer in bytes, if container exists, null otherwise
 */
function* setContainerStatus(build){
  var container = new Container({
    docker: probo_config.docker,
    containerId: build.container.id
  })

  function* getState(container){
    try {
      var state = yield container.getState()
      return state.Running ? "running" : "stopped"
    } catch (e){
      if(e.statusCode === 404) // 404 if container doesn't exist
        return null
      throw e
    }
  }

  _.assign(build.container, yield {
    disk: yield container.getDiskUsage(),
    state: yield getState(container)
  })

  // console.log(build.container)

  return build
}


function* start(){
  // list all builds
  // var cm = new this.probo.ContainerManager()
  // cm.configure(this.probo.config, function(){})

  var builds = yield* get_builds()
  var projects = yield* builds_to_projects(builds) // list of projects each with a builds array

  // console.log(JSON.stringify(builds, null, 2))

  // now we have projects with builds
  // console.log(JSON.stringify(projects, null, 2))

  for (let build of builds){
    yield* setContainerStatus(build)
  }

  // console.log(JSON.stringify(builds, null, 2))
  // return


  for(let project of projects){
    // console.log(project)

    console.log(`Project ${project.id} ${project.slug}`)
    //printBuilds(project.builds)
    printPRs(project.pull_requests)
    //printBranches(project.branches)

    continue


    var latest_shas = pull_requests.map(function(pr){ return pr.head.sha })

    // find build containers not matching the latest sha
    function contains(haystack, needle){ return haystack.indexOf(needle) >=0 }
    var old_builds = project.builds.filter(function(build){
      return !contains(latest_shas, build.ref)
    }).map(function(build){ return build.container.name })
    var current_builds = project.builds.filter(function(build){
      return contains(latest_shas, build.ref)
    }).map(function(build){ return build.container.name })

    console.log("old builds", old_builds.length, old_builds)
    console.log("current builds", current_builds.length, current_builds)

    console.log("attempting to stop/kill all old containers...")

    for(let container_name of old_builds){
      console.log(container_name)

      let container = new Container({
        docker: this.probo.config.docker,
        containerId: container_name
      })

      Promise.promisifyAll(container.container)

      try {
        let res = yield container.container.removeAsync({force: true, v: true}) // volumes too
        console.log(`container ${container_name} REMOVED`)
      } catch(e){
        if(e.statusCode == 404){
          // container is already gone
          console.log(`container ${container_name} already REMOVED`)
        } else {
          console.log(`container ${container_name} FAILED: ${e.message}`)
        }
      }
    }

    return

    console.log("all old containers removed!")

    var existing_probo_containers = yield* get_container_names_for_project(project)

    console.log("all exitsing containers:", existing_probo_containers)

    // find containers that should not be in the active list
    let bad_containers = existing_probo_containers.filter(function(name){
      return contains(old_builds, name)
    })

    let good_containers = existing_probo_containers.filter(function(name){
      return !contains(old_builds, name)
    })

    console.log("containers to be deleted:", bad_containers)
    console.log("containers to be kept:", good_containers)
  }
}



exports.run = co.wrap(function* (probo) {
  // disable bunyan output
  var logger = (require ('../lib/logger')).getLogger();
  logger._level = Number.POSITIVE_INFINITY;

  probo_config = probo.config

  try{
    yield start.apply({probo})
  } catch(e) {
    console.error(e.stack)
  }
})

module.exports = exports;

utils = {
  indexBy: function(array, field){
    // like lodash.indexBy, but instead of a single value, maps keys to an array of values
    return array.reduce(function(accum, obj){
      var key = obj[field]
      accum[key] = accum[key] || []

      accum[key].push(obj)
      return accum
    }, {})
  },

  sorter: function(field, dir){
    // sorts by descending order if dir is 'desc', ascending otherwise
    return function cmp(a, b){
      var value_a = typeof field == 'function' ? field(a) : a[field]
      var value_b = typeof field == 'function' ? field(b) : b[field]

      if(typeof value_a == 'undefined') value_a = 'undefined'
      if(typeof value_b == 'undefined') value_b = 'undefined'

      if(value_a < value_b) return dir == 'desc' ? 1 : -1
      if(value_a === value_b) return 0
      return dir == 'desc' ? -1 : 1
    }
  }
}
