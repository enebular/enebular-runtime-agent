# enebular-agent - Mbed Cloud Connector

*Read this in other languages: [English](README.md), [日本語](README.ja.md)*

このアプリケーションは、Mbed Cloud経由でenebularとの通信をサポートするためにenebular-agentと一緒に利用する、Mbed Cloudのクライアントです。


enebular-agent向けの「Connector Service」を、Mbed Cloudに接続し、Mbed Cloudのリソース更新で受信するデータをUnixソケット経由でenebular-agentに受け渡すことによって、実装しています。

このプロジェクトは現在、[mbed-cloud-client-example](https://github.com/ARMmbed/mbed-cloud-client-example)のプロジェクトに含まれているビルドシステムをそのまま採用しています。

## 開発者モードとファクトリーモード

mbed-cloud-client-exampleのプロジェクトと同様に、デフォルトではMbed Cloudへの接続に開発者用の資格情報が使われるように設定されています。ファクトリー用の資格情報を利用して実行させたい場合、アプリケーションをビルドする前に以下の例のように`define.txt`ファイルで定義されている`MBED_CONF_APP_DEVELOPER_MODE`項目を`0`に変更して開発者モードを無効にしてください。

```
add_definitions(-DMBED_CONF_APP_DEVELOPER_MODE=0)
```

## ビルド方法

このプロジェクトはMbed向けのものであるため、Mbedプロジェクトの構築方法やビルド方法の一般知識があることが望ましいです。

ビルドするための準備の手順は以下の通りです。

- [Mbed CLIツール](https://github.com/ARMmbed/mbed-cli#installing-mbed-cli)をインストールします

- git cloneコマンドまたはmbedコマンドを利用してプロジェクトを取得します

- プロジェクトのディレクトリに移動します

- プロジェクトをgit cloneコマンドで取得した場合、Mbed CLIツールの`mbed deploy`コマンドを利用して依存するライブラリを追加する必要があります

開発者モードを利用する場合、Mbed Cloudの開発者用の資格情報を以下の手順で設定します。

- [Mbed Cloud portal](https://portal.mbedcloud.com/login)にログインします

- "Device identity > Certificates"に移動します

- "Actions > Create a developer certificate"を選択します

- "Developer C file"をダウンロードします。ファイル名は`mbed_cloud_dev_credentials.c`になります

- ファイルをプロジェクトのディレクトリにコピーします

これでプロジェクトをビルドするための準備は完了です！次のコマンドでビルドすることが出来ます。

```
python pal-platform/pal-platform.py fullbuild --target x86_x64_NativeLinux_mbedtls --toolchain GCC --external ./../define.txt --name enebular-agent-mbed-cloud-connector.elf
```

ビルド時のオプションの詳細情報については、以下のMbed Cloudのドキュメントを参照してください。

- [Connecting](https://cloud.mbed.com/docs/current/connecting/connecting.html)
- [pal-platform utility](https://cloud.mbed.com/docs/current/porting/using-the-pal-platform-utility.html)

ビルドが完了すると、`out/Debug`と`out/Release`のディレクトリの下に`enebular-agent-mbed-cloud-connector.elf`という実行ファイルができます。

## 実行方法

このアプリケーションはenebular-agentと通信するため、enebular-agentを先に起動させないといけません。具体的には、enebular-agentの **local** ポートを実行する必要があります。enebular-agentの設定や実行方法の詳細情報については、プロジェクトのreadmeファイルを参照してください。

enebular-agentが実行状態になってから、`enebular-agent-mbed-cloud-connector.elf`実行ファイルを実行します。Mbed Cloudへの接続が確立するとenebularのagentとして利用することが出来ます。

デフォルトではログメッセージはコンソールには出力されませんが、`-c`オプションを指定することによって出力することが出来ます。サポートされているオプションの情報は下記のように`-h`オプションを指定して表示することが出来ます。

```
./out/Release/enebular-agent-mbed-cloud-connector.elf -h
```
