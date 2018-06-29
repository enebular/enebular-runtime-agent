#!/bin/bash


DEBUG="debug" ./bin/enebular-awsiot-agent --node-red-dir="/node-red-dir-overide" &> /tmp/test.log &
#DEBUG="debug" ./bin/enebular-awsiot-agent &> /tmp/test.log &
last_pid=$!
sleep 3 
ret=`ps -p $last_pid | grep -o $last_pid | wc -l`
if [ $ret -eq 1 ]; then
  echo "kill the agent"
  kill -KILL $last_pid
fi


