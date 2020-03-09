if [ $# -ne 2 ]; then
    echo "[error]param number is $#"
    while true
    do
    sleep 1
    done
fi

if [ $1 != "aaa" ]; then
  echo "[error]param1 is $1"
    while true
    do
    sleep 1
    done
else

if [ $2 != "bbb" ]; then
  echo "[error]param2 is $2"
    while true
    do
    sleep 1
    done
else

if [ ${TEST_ENV_VAR1} != 1 ]; then
  echo "[error]TEST_ENV_VAR1 is ${TEST_ENV_VAR1}"
    while true
    do
    sleep 1
    done
else

if [ ${TEST_ENV_VAR2} != 2 ]; then
  echo "[error]TEST_ENV_VAR2 is ${TEST_ENV_VAR2}"
    while true
    do
    sleep 1
    done
else

echo "[success] param test is OK"