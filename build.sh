#!/bin/bash
Cyan='\033[0;36m'
Red='\033[0;31m'
Green='\033[0;32m'

help() {
  echo ""
  echo "build.sh - Script to build and push a Dockerfile to a repository."
  echo ""
  echo "Usage:"
  echo "./build.sh <repository_name> <tag>"
  echo ""
  echo "Example: To build an image tagged 'dev' for DockerHub on my account:"
  echo "./build.sh mbagnall dev\n"
  echo ""
  echo "Example: To build an image tagged 'dev' on a private registry with"
  echo "the 'probo' namespace:"
  echo "./build.sh docker.example.com/probo dev"
  echo ""
  exit 1;
}

if [ -n "$2" ]; then
  export tag=$2
else
  export tag="latest"
fi

if [ -z "$1" ]; then
  export repo="proboci"
else
  export repo=$1
fi

printf "${Cyan}Building Probo..............................."
stuff=`docker build . -q -t $1/probo:$tag`;
if [[ $? == 0 ]]; then
  printf "${Green}[ok]\n";
else
  printf "${Red}[error]\n";
  exit 1;
fi

stuff=`docker push -q $1/probo:$tag`;
if [[ $? == 0 ]]; then
  printf "${Green}[ok]\n";
else
  printf "${Red}[error]\n";
  exit 1;
fi
