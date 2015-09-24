# Quickstart Table of Contents

* [Install](#install)
  * [Source Code](#source)
  * [Dependencies](#dependencies)
* [Setup](#setup)
  * [Github Handler](#github-handler)
  * [Container Manager](#container-manager)
  * [Loom](#loom)
* [Build Config](#builds)

# Install <a name="install"/>
## Source Code <a name="source"/>

Clone all repositories

```
git clone https://github.com/ProboCI/probo.git
git clone https://github.com/ProboCI/probo-asset-receiver.git
git clone https://github.com/ProboCI/probo-loom.git
git clone https://github.com/ProboCI/probo-proxy.git
```

## Install Dependencies <a name="dependencies"/>

### Node.js

Probo requires any version of `io.js`, or node `0.12` or greater.

### Docker

```
wget -qO- https://get.docker.com/ | sudo sh
```

### Ensure Probo's base docker image is installed on your system

``` bash
docker pull proboci/ubuntu-14.04-lamp
```

# Setup <a name="setup"/>

## Deployment <a name="deployment"/>

Several components of the system require full DNS names to function properly and cannot be addressed at `localhost`. For this tutorial, we assume that the server your install is running on is publically routable on the `probo.domain.com` domain, and that all services are directly accessible on their ports as well (such as `http://probo.domain.com:3020`).

In order to view the results of the builds ensure that `*.probo.domain.com` is also pointing to your server.

Note that this configuration is suitable for development, but do NOT use for production. Reverse-proxying and SSL configuration are out of scope for this document.


## Github Handler <a name="github-handler"/>

The Github Handler (GHH) processes Github hook events each time a pull request is created or updated. It then triggers builds through the Container Manager. The Github Handler also sends commit status updates back to Github.

It is implemented as a plugin of the `probo` repository.

```
cd probo
npm install
```

### Configure

Create a file `ggh.yaml` with the follwing contents:

``` yaml
# Port for the server to listen on
port: 3010
hostname: 0.0.0.0

# Github hook and credentials
githubWebhookPath: '/github-webhook'
githubWebhookSecret: 'CHANGE-ME'
githubAPIToken: 'personal token here'

# Container Manager API server
api:
  url: "http://localhost:3020"
```

Of the defaults above, `githubAPIToken` must be set to your token. You can generate a personal token at [https://github.com/settings/tokens]. A token created from an OAuth flow will also work here. Probo requires the `repo` scope.

The `githubWebhookSecret` value should be modified to a secure string as well.


### Run

```
node ./bin/probo github-handler -c ghh.yaml
```

Now add a webhook for your repository in Github to your server under `Settings` -> `Webhooks & services`. Direct link to the configuration page: https://github.com/OWNER/REPO/settings/hooks.

Set the following properties:

```
Payload URL: http://probo.domain.com:3010/github-webhook
Secret: CHANGE-ME (or your value from `githubWebhookSecret` in the config file)
```

Next, under "Which events would you like to trigger this webhook?", select "Let me select individual events", and select "Pull Request"


If you see a green checkmark next to your new webhook, you're all set. Github can succesfully send requests to your handler.


## Container Manager <a name="container-manager"/>

The Container Manager (CM) manages docker containers and kicks off builds.

It is implemented as a plugin of the `probo` repository.

```
cd probo
npm install
```

### Configure

Create a file `cm.yaml` with the follwing contents:

``` yaml
# container manager config file

hostname: localhost
port: 3020
# name of the instance used in status updates
instanceName: 'ProboCI-local'

# Github Handler server
api:
  url: "http://localhost:3010"

# Loom (log aggregator server)
loom:
  url: "http://localhost:3060"

# asset server (must NOT be localhost because it's called from within a container)
assets:
  url: "http://probo.domain.com:3070"

# URL template string for viewing each build. {{buildId}} expands to the id of the build.
buildUrl: "http://{{buildId}}.probo.domain.com:3050/"
```

The defaults above are fine for a basic setup. However, make sure to modify the domain in `buildUrl` to match your setup.

### Run

```
node ./bin/probo container-manager -c cm.yaml
```


## Build Proxy <a name="proxy"/>

The build proxy maps an external host/port to a build container's port 80 to view the built web application.

```
cd probo-proxy
npm install
```

### Configure
Create a file `proxy.yaml` with the follwing contents:

``` yaml
# port that the proxy server is running on
port: 3050

# Host for the container lookup service that maps a build id to a host/port to proxy to
containerLookupHost: "http://localhost:3020"
```

Ensure that `containerLookupHost` matches the URL of your Container Manager instance.


### Run
```
node ./index.js -c proxy.yaml
```



## Loom <a name="loom"/>

Loom is the task output aggregation service that records and plays back live log streams. Loom currently requires RethinkDB as a backing store.

```
cd probo-loom
npm install
```

### Configure
The default config works well for a development setup.

### Run
```
node ./index.js
```

Loom comes with a handy spy tool that streams all live logs in one place. You can use it to view live output from your build tasks.


### Spy
```
npm run spy
```

# Build Config <a name="builds"/>

Probo runs builds based on a `/.probo.yaml` file found in the root of your repository. You can task the Container Manager to run any number of build steps. Each step is a runnable plugin, and will get a status update sent to Github for the commit.

When the build runs, your source code for the commit that triggered the build is automatically available to you in the `$SRC_DIR` directory inside the container.

Sample `.probo.yaml` file:

``` yaml
# Each step is the build/test process
# the name of teach step is the build context, and will get its own status updates
steps:
  - name: Look Around
    plugin: 'Shell'  # this is the default plugin
    command: "ls $SRC_DIR"  
  - name: Create Site
    command: "drush fec myrepo --json-config='{\"settings_php.snippets\": []}'"
```


See the [Drupal Bear](https://github.com/zivtech/bear) repository for a full example.

