#!/bin/bash

echo ""
echo "-----------------------------------------------------"
echo "Building Probo Container Manager/GitHub Handler Image"
echo "-----------------------------------------------------"

if [ -n "$2" ]; then
  export tag=$2
else
  export tag="dev"
fi

if [ -z "$1" ]; then
  echo "ERROR: You need to provide the repository name."
  echo ""
  exit 1;
fi

echo -n "Hash: "
docker build . -q -t $1/container-manager:$tag
echo -n  "Repo: "
docker push -q $1/container-manager:$tag
echo ""
