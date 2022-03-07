#!/bin/bash

docker build . -t proboci/container-manager:dev
docker push proboci/container-manager:dev
