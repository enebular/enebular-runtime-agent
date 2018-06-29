function fail {
  echo -e "######## \033[31m  ✘ $1\033[0m"
  exit 1
}

function success {
  echo -e "\033[32m------------> ✔ $1\033[0m"
}

function should {
    sleep 0.3
    OUT=`cat /tmp/test.log | grep -o "$2" | wc -l`
    [ $OUT -eq $3 ] || fail "$1"
    success "$1"
}

function shouldnot {
    sleep 0.3
    OUT=`cat /tmp/test.log | grep -o "$2" | wc -l`
    [ $OUT -ne $3 ] || fail "$1"
    success "$1"
}

function exists {
    sleep 0.3
    OUT=`cat /tmp/test.log | grep -o "$2" | wc -l`
    [ $OUT -ge 1 ] || fail "$1"
    success "$1"
}

function run {
  cmd=$1' &> /tmp/test.log &'
  echo $cmd
  eval $cmd
  last_pid=$!
  sleep 2 
  ret=`ps -p $last_pid | grep -o $last_pid | wc -l`
  if [ $ret -eq 1 ]; then
    kill -KILL $last_pid
  fi
}
