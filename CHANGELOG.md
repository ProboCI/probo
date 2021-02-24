# Probo Changelog

## 4.5.3
- Feb 16 2020
- Set Drupal 8 as default Drupal version in Probo Drupal plugin. (https://github.com/ProboCI/probo/pull/179) 
- Add support for Drupal 9 in the Probo Drupal plugin. (https://github.com/ProboCI/probo/pull/179)

## 4.5.2
- Feb 5 2020
- Add PHP 7.3 to allowed images. (https://github.com/ProboCI/probo/pull/175)
- Add PHP 7.4 to allowed images. (https://github.com/ProboCI/probo/pull/175)

## 4.5.1
 - Feb 4 2020
 - Fix issues with mysql and varnish services starting properly in LAMP and Drupal plugins. (https://github.com/ProboCI/probo/pull/174)

## 4.5.0
 - Jan 21 2020
 - Add self-hosted GitLab server support. (https://github.com/ProboCI/probo/pull/163)

## 4.4.1
 - May 16 2019
 - Fix GitLab container naming error. (https://github.com/ProboCI/probo/pull/160)

## 4.4.0
 - Nov 20 2018
 - Add lighthouse integration plugin (https://github.com/ProboCI/probo/pull/146)
 - Run memcache when starting containers (https://github.com/ProboCI/probo/pull/154)
 - Do not unnecessarily restart apache in LAMP plugin (https://github.com/ProboCI/probo/pull/153)
 - Fix issues with mysql db connections in LAMP plugin (https://github.com/ProboCI/probo/pull/150)

## 4.3.0
  - Sep 6 2018
  - Add php ini options separately to cli and apache2 (see: https://github.com/ProboCI/probo/pull/144)

## 4.2.0
  - Aug 21 2018
  - Add mysql options to lamp plugin (see: https://github.com/ProboCI/probo/pull/131)
  - Add varnish options to lamp plugin (see: https://github.com/ProboCI/probo/pull/145)

## 4.1.0
  - July 2 2018
  - Add support for GitLab (see: https://github.com/ProboCI/probo/pull/141)

## 4.0.0
 - June 20 2018
 - Support for new docker images and dropping the old ones (see: https://github.com/ProboCI/probo/pull/135)

## 3.11.6
 - May 9 2018
 - Add Drupal for arguments for drush make (see: https://github.com/ProboCI/probo/pull/140)

## 3.11.5
 - Dec 7 2017
 - Add some tests for the wordpress plugin

## 3.11.4
 - Dec 6 2017
 - Provide db prefix settings to the Wordpress plugin (see: https://github.com/ProboCI/probo/pull/133)

## 3.11.3
 - Nov 20 2017
 - Update list of docker images to be allowed for builds (see: https://github.com/ProboCI/probo/pull/130)
 - Fixing a bug in the way PHP ini settings are managed (see: https://github.com/ProboCI/probo/pull/121)
 - Allow for custom Wordpress database table prefixes (see: https://github.com/ProboCI/probo/pull/116)
 - Auto-testing and linting with git pull or pushes

## 3.11.2
 - Nov 16 2017
 - Linting code to keep up standards
 - Adding nightly images to our whitelist of docker images allowed for builds (see: https://github.com/ProboCI/probo/pull/129)
 - Update tests to prevent undefined probo yaml options (see: https://github.com/ProboCI/probo/pull/128)

## 3.11.1
 - Nov 13 2017
 - Add option to provide Drupal with a database prefix (see: https://github.com/ProboCI/probo/pull/126)

## 3.11.0
 - Nov 10 2017
 - Remove `-e` from bash args for build plugins to allow bash runs to continue if something failes (see: https://github.com/ProboCI/probo/pull/77)
 - Address incompatible buildId and Container stop (see: https://github.com/ProboCI/probo/pull/124)

## 3.10.0
 - Jun 12 2017
 - Applies a fix that caused the container manager to crash in some scenarios.
 - Adds new allowed docker images to the default configuration.

## 3.9.0
 - Add branch link & name, PR link & name, and commit link to ENV. These are now accessible in ENV variables. (including from within .probo.yaml)
 - See the docs for more info on ENV variables: https://docs.probo.ci/build/steps

## 3.8.0
 - Use constants to define status / state of builds and build steps
 - Create a new 'running' state for builds and build steps that are in progress. From now on, a 'pending' state means the build or build step is saved but not yet started.
 - Map the 'running' state to 'pending' for Github updates, because Github does not recognize a state called 'running'.

## v3.1.2

 - Added ability to specify the Drupal 8 configuration directory from which data should be synchronized.
