Lapew Amore
===========

Lapew Amore is the routing layer for [lepew](https://github.com/tizzo/lepew).
It is responsible for looking up what docker container a given subdomain is
running on (currently based on container name) and then proxy the request
to that container.  It also is responsible for starting and stopping these
containers as they reach their idle time timeouts.

Ths repository is a holding place and more likely to be broken then not at any
given time.
