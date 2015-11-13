"use strict"

var co = require('co')
var read = require('co-read')
var through2 = require('through2')
var JSONStream = require('JSONStream')
var GitHubApi = require('github')
var Promise = require('bluebird')
var _ = require('lodash')
var request = require('request')
var requestAsync = require('request-promise')
var bytes = require('bytes')

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
    .describe('c', 'Optinal yaml config file')
  ;
}

/**
 * @param Array builds  - List of existing builds on the GH instance.
 * @param Object opts - Options object
 * @param boolean opts.all=false  - if true, fetch all builds, whether an container exists for the build or not. By default, only returns builds that have an existing container
*/
function* get_builds(opts){
  opts = opts || {}
  var query = `${opts.all ? "all=true" : ""}`
  var buildStream = request(`http://${probo_config.hostname}:${probo_config.port}/builds?${query}`).pipe(new JSONStream.parse('*'))

  // parse out just what we need and filter
  buildStream = buildStream.pipe(through2.obj(function(build, enc, callback){
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
      console.log("getting Github PR statuses for project " + project.slug)
      pull_requests = yield github.pullRequests.getAllAsync({
        user: project.owner,
        repo: project.repo,
        // state: 'open'
      })
    } catch (e){
      console.log(e)
    }

    // create a map from PR number to PR object
    pr_cache[project.id] = utils.indexBy(pull_requests, 'number', true)
  }

  return pr_cache[project.id][pr]
}


/**
 * Returns an array of projects.
 * Each project has .builds, .prs, and .branches arrays.
 * The builds array is all the builds for the project, sorted by createdAt date,
 *   descending.
 * The prs array is all the PRs, sorted by PR number, descending.
 *   Each object is {pr, builds, state}. State is GH info for the PR,
 *   if it's a GH project.
 * The branches array is all the builds for a particular branch,
 *   sorted by createdAt in descending order. Each object is {branch, builds}
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
    console.log(`${indent}Build ${build.id} ${build.createdAt} pr:${build.pullRequest} branch:${build.branch} container:${build.container.state}`)
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
    console.log(`\tBranch ${branch.branch} [${branch.builds.length} builds]`)
    printBuilds(branch.builds, indent + "\t")
  }
}

function* start(){
  // list all builds
  var builds = yield* get_builds()
  var projects = yield* builds_to_projects(builds) // list of projects each with a builds array

  for(let project of projects){
    console.log(`Project ${project.id} ${project.slug}`)
    //printBuilds(project.builds)
    printPRs(project.pull_requests)
    // printBranches(project.branches)
  }
}

exports.run = co.wrap(function* (probo) {
  probo_config = probo.config

  try{
    yield start()
  } catch(e) {
    console.error(e.stack)
  }
})

module.exports = exports;

utils = {
  /**
   * like lodash.indexBy, but instead of a single value, maps keys to an array of values.
   * @param [single=false] boolean - if true, uses the lodash implementation (resulting in single value per key)
   */
  indexBy: function(array, field, single){
    if(single){
      return _.indexBy(array, field)
    }

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
