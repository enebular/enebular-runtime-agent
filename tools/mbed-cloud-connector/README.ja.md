# enebular-agent - Mbed Cloud Connector

*Read this in other languages: [English](README.md), [日本語](README.ja.md)*

このアプリケーションはPelion Device Managementのクライアントです。enebular-agentと併せて利用し、Pelion Device Managementを経由したenebularとの通信をサポートします。

この「Connector Service」は、Pelion Device Managementリソース更新のデータをUnixソケット経由でenebular-agentに送信し実装しています。

このプロジェクトは現在、[mbed-cloud-client-example](https://github.com/ARMmbed/mbed-cloud-client-example)のプロジェクトに含まれているビルドシステムをそのまま採用しています。

## デベロッパーモードとファクトリーモード

mbed-cloud-client-exampleのプロジェクトと同様に、デフォルトではPelion Device Managementへの接続にデベロッパーモードのクレデンシャル情報が使われるように設定されています。ファクトリーモードのクレデンシャル情報を利用して実行させたい場合、アプリケーションをビルドする前に以下の例のように`define.txt`ファイルで定義されている`MBED_CONF_APP_DEVELOPER_MODE`項目を`0`に変更してモードを無効にしてください。

```
add_definitions(-DMBED_CONF_APP_DEVELOPER_MODE=0)
```

## ビルド方法

このプロジェクトはMbed向けのものであるため、Mbedプロジェクトの構築方法やビルド方法の一般的な知識を持っていることを前提としています。

ビルドするための準備の手順は以下の通りです。

1 . [Mbed CLIツール](https://github.com/ARMmbed/mbed-cli#installing-mbed-cli)をインストールします

2 . `git clone`コマンドまたは`mbed import`コマンドを利用してプロジェクトを取得します

3 . プロジェクトのディレクトリに移動します

4 . プロジェクトをgit cloneコマンドで取得した場合、Mbed CLIツールの`mbed deploy`コマンドを利用して依存するライブラリを追加する必要があります

デベロッパーモードを利用する場合、Pelion Device Managementのクレデンシャル情報を以下の手順で設定します。

5 . [Pelion Device Management portal](https://portal.mbedcloud.com/login)にログインします

6 . "Device identity > Certificates"に移動します

7 . "Actions > Create a developer certificate"を選択します

8 . "Developer C file"をダウンロードします。ファイル名は`mbed_cloud_dev_credentials.c`になります

9 . ダウンロードしたファイルをプロジェクトのディレクトリにコピーします

これでプロジェクトをビルドするための準備は完了です！次のコマンドでビルドすることが出来ます。

```
python pal-platform/pal-platform.py fullbuild --target x86_x64_NativeLinux_mbedtls --toolchain GCC --external ./../define.txt --name enebular-agent-mbed-cloud-connector.elf
```

ビルド時のオプションの詳細情報については、以下のPelion Device Managementのドキュメントを参照してください。

- [Connect a Linux device](https://cloud.mbed.com/docs/current/connecting/linux-on-pc.html)
- [pal-platform utility](https://cloud.mbed.com/docs/current/porting/using-the-pal-platform-utility.html)

ビルドが完了すると、`out/Debug`と`out/Release`のディレクトリの下に`enebular-agent-mbed-cloud-connector.elf`という実行ファイルができます。

## 実行方法

このアプリケーションはenebular-agentと通信するため、enebular-agentを先に起動させないといけません。具体的には、enebular-agentのlocalポート(※)を実行する必要があります。enebular-agentの設定や実行方法の詳細情報については、プロジェクトのreadmeファイルを参照してください。
(※) ここでのポートとは、enebular-agentをAWS IoTやPelion Device Managementなどの外部サービスと連携するために個別に準備されたenebular-agentのエディションのことを指します。

enebular-agentが実行状態になってから、`enebular-agent-mbed-cloud-connector.elf`という名前の実行ファイルを実行します。Pelion Device Managementへの接続が確立するとenebularのエージェントとして利用することが出来ます。

デフォルトではログメッセージはコンソールに出力されませんが、`-c`オプションを指定することによって出力することが出来ます。サポートされているオプションの情報は下記のように`-h`オプションを指定して表示することが出来ます。

```
./out/Release/enebular-agent-mbed-cloud-connector.elf -h
```
