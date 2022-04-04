#!/bin/bash
set -e

(cd node-red && npm ci --production)
(cd agent && npm ci --production)
(cd ports/awsiot && npm ci --production)
