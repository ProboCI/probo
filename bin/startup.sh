#!/bin/bash

if [ -v CONTAINER_MANAGER ]; then
  /home/probo/app/bin/probo container-manager -c /etc/probo/container-manager.yaml
fi

if [ -v GITHUB_HANDLER ]; then
  /home/probo/app/bin/probo github-handler -c /etc/probo/github-handler.yaml
fi
