
#! /bin/bash

count=0
tmp_num=1

if [ $# -gt 0 ]; then
    tmp_num=$1
fi

while [ $count -lt $tmp_num ]
do
sleep 1
count=`expr $count + 1`
done

echo "exec file ended"