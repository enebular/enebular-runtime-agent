declare -i COUNTER
declare -i TMP_NUM
COUNTER=0
TMP_NUM=3

if [ $# -gt 0 ]; then
    TMP_NUM=$1
fi

while [ "$COUNTER" -lt "$TMP_NUM" ]
do
sleep 1
let COUNTER++
done