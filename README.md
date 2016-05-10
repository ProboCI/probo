Probo
===========
[![Build Status](https://travis-ci.org/ProboCI/probo.svg?branch=master)](https://travis-ci.org/ProboCI/probo) [![Coverage Status](https://coveralls.io/repos/ProboCI/probo/badge.svg?branch=master&service=github)](https://coveralls.io/github/ProboCI/probo?branch=master)

[Probo.ci](http://probo.ci) is an open source continuous integration and quality assurance tool
that lets you build branches and pull requests inside docker containers,
reports back on the progress of each step, and then *keeps the environment
around* and gives you a link so that you can go and preview the work in a
shared space.

Probo has a [Service Oriented Architecture](https://en.wikipedia.org/wiki/Service-oriented_architecture) so to
get the full picture have a look at all of the projects in the [Probo Organization](https://github.com/ProboCI).
This project currently contains the Container Manager (which provides a high level interface to docker) and
the Github Handler (responsible for receiving data from and sending data to github). In the long term these
services will be factored out into their own projects and this project will be a packaging project making it
easy to install compatible versions of all of the individual services.

## Quickstart

See the [Quickstart](QUICKSTART.md) guide for how to get up and running with your own instance of Probo

## Compatibility
The code uses generators and requires node `io.js` or `node` 4.x+.

## Error Codes
Errors are thrown when a build cannot be found however there are man reasons a
build may not be found. These include:
 - Build has been reaped
 - Build is currently still building
 - Build id is invalid or does not exist

We return a 404 when a build cannot be found. However for the sake of
integration with other services, the error response will be a JSON object
with an errorCode:
 - 404R: Build reaped
 - 404P: Build in progress
 - 404I: Build id invalid
 - 404N: Build id not found