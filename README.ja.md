# enebular-agent - Mbed Cloud Connector

*Read this in other languages: [English](README.md), [日本語](README.ja.md)*

このアプリケーションはMbed Cloud経由でenebularとの通信をサポートするためにenebular-agentと一緒に利用するMbed Cloudのクライアントです。


Mbed Cloudに接続して、Mbed Cloudのリソース更新で受信するデータをUnixソケット経由でenebular-agentに受け渡すことによってenebular-agent向けの「Connector Service」を実装しています。

現在、このプロジェクトが[mbed-cloud-client-example](https://github.com/ARMmbed/mbed-cloud-client-example)のプロジェクトに含まれているビルドのシステムをそのまま採用しています。

## 開発者モードとファクトリーモード

mbed-cloud-client-exampleのプロジェクトと同様に、デフォルトではMbed Cloudへの接続に開発者用の資格情報が使われるように設定されています。ファクトリー用の資格情報を利用して実行させたい場合、アプリケーションをビルドする前に以下の事例のように`define.txt`ファイルで定義されている`MBED_CONF_APP_DEVELOPER_MODE`項目を`0`に変更して開発者モードを無効にします。

```
add_definitions(-DMBED_CONF_APP_DEVELOPER_MODE=0)
```

## ビルド方法

このプロジェクトがMbed向けのものであるため、Mbedプロジェクトの構築方法やビルド方法の一般知識があると役に立ちます。

ビルドするための準備の手順は以下の通りです。

- [Mbed CLIツール](https://github.com/ARMmbed/mbed-cli#installing-mbed-cli)をインストールします。

- gitのcloneコマンドまたはmbedコマンドを利用してプロジェクトを取得します。

- プロジェクトのディレクトリに移動します。

- プロジェクトをgitのcloneコマンドで取得した場合、Mbed CLIツールの`mbed deploy`コマンドを利用して依存されているライブラリを追加しないといけません。

開発者モードで利用する場合、Mbed Cloudの開発者用の資格情報を以下の手順で設置します。

- [Mbed Cloud portal](https://portal.mbedcloud.com/login)にログインします。

- "Device identity > Certificates"に移動します。

- "Actions > Create a developer certificate"を選択します。

- "Developer C file"をダウンロードします。`mbed_cloud_dev_credentials.c`というファイル名になります。

- そのファイルをプロジェクトのディレクトリにコピーします。

これでプロジェクトをビルドするための準備が完了しています。次のコマンドでビルド出来ます。

```
python pal-platform/pal-platform.py fullbuild --target x86_x64_NativeLinux_mbedtls --toolchain GCC --external ./../define.txt --name enebular-agent-mbed-cloud-connector.elf
```

ビルド時のオプションの詳細情報については、以下のMbed Cloudのドキュメントを参照してください。

- [Connecting](https://cloud.mbed.com/docs/current/connecting/connecting.html)
- [pal-platform utility](https://cloud.mbed.com/docs/current/porting/using-the-pal-platform-utility.html)

ビルドが完了すると、`out/Debug`と`out/Release`のディレクトリの下に`enebular-agent-mbed-cloud-connector.elf`という実行ファイルが出来上がります。

## 実行方法

このアプリケーションがenebular-agentと通信するため、enebular-agentの方を先に起動させないといけません。具体的には、enebular-agentの **local** ポートを実行しないといけません。enebular-agentの設定や実行方法の詳細情報については、そのプロジェクトのreadmeファイルを参照してください。

enebular-agentが実行中の状態になってから`enebular-agent-mbed-cloud-connector.elf`実行ファイルを実行します。Mbed Cloudへの接続が成立したらenebularと一緒にagentとして利用出来ます。

デフォルトではログメッセージがコンソルに出力されませんが、`-c`のオプションを指定することによって有効に出来ます。サポートされているオプションの情報には、`-h`オプション指定して表示します。

```
./out/Release/enebular-agent-mbed-cloud-connector.elf -h
```
