#!/bin/sh

architecture=$(lscpu -J | jq -r '.lscpu[0].data')
if [ "$architecture" = "x86_64" ]; then
  cd /home/probo/app/x64
else
  cd /home/probo/app/arm
fi

tar -xzf docker-20.10.9.tgz
cp docker/* /usr/bin/ 
docker --version

if [[ "$CONTAINER_MANAGER" = 1 ]]; then
  exec /home/probo/app/bin/probo container-manager -c /etc/probo/container-manager.yaml
fi

if [[ "$GITHUB_HANDLER" = 1 ]]; then
  exec /home/probo/app/bin/probo github-handler -c /etc/probo/github-handler.yaml
fi
