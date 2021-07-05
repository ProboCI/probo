# ProboCI
# https://www.probo.ci

FROM node:12.20.2
USER root

RUN apt -y update
RUN apt -y install \
    apt-transport-https \
    ca-certificates \
    curl \
    gnupg \
    lsb-release

RUN wget https://download.docker.com/linux/static/stable/x86_64/docker-20.10.7.tgz \
  && tar -xvzf docker-20.10.7.tgz \
  && cp docker/* /usr/bin/

RUN useradd --user-group --create-home --shell /bin/false probo
RUN mkdir -p /home/probo/app
COPY . /home/probo/app
RUN chown -R probo:probo /home/probo/app

RUN cd /home/probo/app/ && npm install

WORKDIR /home/probo/app

EXPOSE 3010 3020

CMD ["bash", "bin/startup.sh"]
