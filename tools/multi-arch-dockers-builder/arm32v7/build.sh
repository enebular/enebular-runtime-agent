#!/bin/bash
set -e

sudo docker build -t enebularagentdevelopers/enebular-agent-arm32v7:node-22.17.1 .

docker push enebularagentdevelopers/enebular-agent-arm32v7:node-22.17.1


