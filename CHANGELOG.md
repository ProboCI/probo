# Probo Changelog

## 3.8.0
 - Use constants to define status / state of builds and build steps
 - Create a new 'running' state for builds and build steps that are in progress. From now on, a 'pending' state means the build or build step is saved but not yet started.
 - Map the 'running' state to 'pending' for Github updates, because Github does not recognize a state called 'running'.

## v3.1.2

 - Added ability to specify the Drupal 8 configuration directory from which data should be synchronized.
