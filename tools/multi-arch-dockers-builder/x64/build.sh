#!/bin/bash
set -e

sudo docker build -t enebularagentdevelopers/enebular-agent-x64:node-22.17.1 .

docker push enebularagentdevelopers/enebular-agent-x64:node-22.17.1


