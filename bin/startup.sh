#!/bin/sh

if [[ "$CONTAINER_MANAGER" = 1 ]]; then
  exec /home/probo/app/bin/probo container-manager -c /etc/probo/container-manager.yaml
fi

if [[ "$GITHUB_HANDLER" = 1 ]]; then
  exec /home/probo/app/bin/probo github-handler -c /etc/probo/github-handler.yaml
fi
