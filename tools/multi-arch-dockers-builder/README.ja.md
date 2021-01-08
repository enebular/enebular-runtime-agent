# DockerHubの更新方法
enebular-agentは、デバイスでのインストールを高速化するために以下の環境をDocker上に用意し、コンパイル済みバイナリイメージをpipeline上で生成している。

* x64
* arm32v7
* arm64v8

これらの環境はDocker Hubにイメージをアップロードし、pipelineで処理をする際にDockerHubからPullしている。

Docker Hub上のイメージはNodejsのバージョン変更時に更新する必要がある。
更新の手順は以下の通りです。

1. コマンドラインで、Docker Hubの`enebularagentdevelopers`にログイン（パスワードはオペレーションチームに確認）
1. `tools/multi-arch-dockers-builder/arm32v7`に移動
1. `./build.sh`を実行
1. `docker push enebularagentdevelopers/enebular-agent-arm32v7:node-xx.xx.xx`を実行（xxはnodejsのバージョン番号）
1. `tools/multi-arch-dockers-builder/arm64v8`に移動
1. `./build.sh`を実行
1. `docker push enebularagentdevelopers/enebular-agent-arm64v8:node-xx.xx.xx`を実行（xxはnodejsのバージョン番号）
1. `tools/multi-arch-dockers-builder/x64`に移動
1. `./build.sh`を実行
1. `docker push enebularagentdevelopers/enebular-agent-x64:node-xx.xx.xx`を実行（xxはnodejsのバージョン番号）
1. Docker Hub上で、pushされていることを確認
