#
# Copyright 2023 ProboCI, LLC

# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at

# http://www.apache.org/licenses/LICENSE-2.0

# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
#

FROM node:22-alpine
USER root

RUN apk add curl gnupg

COPY conf/proc-specific-install.sh /proc-specific-install.sh
RUN chmod 755 /proc-specific-install.sh && \
  sh /proc-specific-install.sh

RUN mkdir -p /home/probo/app
COPY . /home/probo/app

RUN cd /home/probo/app/ && npm install

WORKDIR /home/probo/app

EXPOSE 3010 3020

CMD ["sh", "/home/probo/app/bin/startup.sh"]
