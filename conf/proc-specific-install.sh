#!/bin/bash

arch=`uname -m`;
echo $arch;

if [ $arch eq 'aarch64' ]
then
  wget https://download.docker.com/linux/static/stable/aarch64/docker-27.5.0.tgz
  tar -xvzf docker-27.5.0.tgz
  cp docker/* /usr/bin/
else
  wget https://download.docker.com/linux/static/stable/x86_64/docker-27.5.0.tgz
  tar -xvzf docker-27.5.0.tgz
  cp docker/* /usr/bin/
fi
