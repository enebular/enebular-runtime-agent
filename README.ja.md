# enebular-agent

_Read this in other languages: [English](README.md), [日本語](README.ja.md)_

enebular-agent は、Linux OS を搭載したゲートウェイ向けの enebular 用 IoT エージェントソフトウェアです。 eneublar-agent は enebular と連携して、Node-RED のフローを IoT デバイスにデプロイして実行することができます。また、IoT デバイスの状態を enebular に通知します。

enebular-agent には次の主要機能があります。

- IoT デバイス（エージェント）のアクティベーションと登録、認証
- Node-RED インスタンスの管理と enebular からデプロイされたフローの実行
- enebular からのファイルデプロイと実行
- enebular へのステータス通知およびログ送信
- enebular editor のサポート

enebular は、サードパーティの IoT プラットフォーム接続を介して enebular-agent と通信します。

## 機能

### 登録と認証

enebular-agent が enebular と通信するには、認証のための登録情報を取得する必要があります。
登録情報の取得は、enebular が IoT プラットフォーム接続経由で登録情報を自動的に enebular-agent に送信することで行います。

ロギングやステータス通知のようにデバイスの有償デバイス化が必要となっている機能の利用を enebular-agent に許可を与えるために、enebular は enebular-agent の認証情報を必要に応じて更新します。

### Node-RED のフロー

enebular-agent は enebular からデプロイされたフローを Node-RED で実行します。また、フローに npm で公開されているノードが使用されている場合、そのノードを自動的にインストールします。

### ファイルデプロイ

enebular-agent は enebular からデプロイされたファイルをインストールします。また、そのファイルの実行と、指定されたコマンドフックの実行に対応しています。

### ロギング

enebular-agent は、定期的に enebular にログメッセージを送信します。標準出力ストリーム（コマンドラインのコンソールなど）にもロギングできますが、デフォルトでは有効になっていません。ロギングするには`DEBUG`環境変数を設定します。また、オプションで syslog にロギングすることもできます。設定オプションの詳細については「設定方法」の項を参照してください。

enebular-agent は、Node-RED が標準出力と標準エラー出力（stdout と stderr）に出力するメッセージをキャプチャしてロギングします。Node-RED が出力するメッセージは全て info レベルでロギングされます。また、実行中のフローに含まれているノードからのメッセージもロギングします（debug ノードで"debug tab and console"の設定がされている場合など）。

ログを enebular で確認するには、対象デバイスが有償デバイスになっている必要があります。

### ステータス通知

enebular-agent は有償デバイスの場合に簡易なステータス情報を enebular に送信します。

## 構成

enebular-agent は、Node.js モジュールの集合として実装されています。enebular-agent のコアランタイム機能は`enebular-runtime-agent`モジュールとして（`agent`ディレクトリの下で）実装されています。この上に、サポートされている IoT プラットフォームの接続タイプごとにモジュールが（`ports`ディレクトリの下に）あります。 各ポートが enebular-runtime-agent コアのモジュールを依存モジュールとして含んでいます。ポートの詳細情報については下記「ポート」の項を参照してください。

Node-RED も Node.js のモジュールとしてインストールされます。

## ポート

ポートとは、enebular-agent を AWS IoT や Pelion Device Management などの外部サービスと連携するために個別に準備された enebular-agent のエディションのことを指します。

enebular-agent を利用するには、利用する外部サービスに合わせて適切なポートを選択し、そのポートのインストールと設定を行ってから、ポートの`bin`ディレクトリの下にある実行ファイルを実行します。

現在、以下のポートがあります。

- **AWS IoT** - AWS IoT と連携して利用します
- **Pelion** - Arm Pelion と連携して利用します

## enebular editor との連携利用

enebular-agent を enebular editor と連携して利用するには、`--dev-mode`オプションを指定して enebular-agent を開発者用モードで起動する必要があります。このオプションは、下記「クイックセットアップ」の項で説明されているインストール用のスクリプトを利用する場合にも、 enebular-agent を手動で起動する場合にも指定することができます。

## アップデート

enebular-agentのアップデート方法の詳細情報については、アップデータの readme ファイルを参照してください。

- [Updater README](tools/updater/README.ja.md)

## クイックセットアップ

インストール用のスクリプトを使用して enebular-agent を Raspberry Pi のような Debian ベースのデバイスで素早くセットアップできます。 このスクリプトは ssh クライアントを使用して開発用の PC 上のコマンドとして実行することをお勧めします。スクリプトの使用要件は以下の通りです。

- 開発用の PC に ssh クライアントコマンドがインストールされていること
- ターゲットのデバイスに `sudo` コマンドがインストールされていること

また、ターゲットのデバイスに関する以下の情報も必要になります。

- ユーザログイン情報（ユーザ名とパスワード）
- 現在の IP アドレス

enebular-agent を AWS IoT と一緒に使用して、新しいモノを自動的に追加して利用したい場合は、次の情報が必要になります。

- AWS アカウントのアクセスキー ID (access key ID)
- AWS アカウント秘密アクセスキー (secret access key)
- AWS IoT のリージョン
- 追加するモノの名前

enebular-agent を Arm Pelion と一緒に使用する場合、以下のいずれかが必要になります。

- Pelionの開発者用認証情報ファイル
- Pelionのファクトリー用認証情報palディレクトリ

### 基本的な利用方法

インストールスクリプトは、次のコマンドで開発用の PC 上の SSH を使用してリモートのデバイスで実行します。

```sh
ssh -t <user>@<device-ip-address> "wget -qO- https://enebular.com/agent-install | sudo -E bash -s"
```

上記のコマンドパターンではデフォルトで AWS IoT 用の enebular-agent ポートがインストールされます。

例えば、リモートの Raspberry Pi のデフォルトである `pi` ユーザーと `192.168.1.125` の IP アドレスを使用してスクリプトを実行する場合のコマンドは次のようになります。

```sh
ssh -t pi@192.168.1.125 "wget -qO- https://enebular.com/agent-install | sudo -E bash -s"
```

AWS IoT以外のポートをインストールするには、`--port`オプションを指定します。Pelionのポートをインストールする場合のコマンドは次のようになります。

```sh
ssh -t pi@192.168.1.125 "wget -qO- https://enebular.com/agent-install | sudo -E bash -s -- --port=pelion"
```

上記のコマンドで enebular-agent がインストールされますが、必要な接続情報がまだ設定されていないため、起動することが出来ません。 新しい AWS IoT の*モノ*を自動的に追加して利用したい場合は、上記のコマンドの代わりに下記の「AWS IoT の Thing 自動作成とセットアップ」の説明に従ってください。また、 enebular-agent の Pelion ポートを利用して必要となる認証情報をインストールしたい場合は、下記の「Pelion の認証情報インストール」の説明に従ってください。

手動で接続情報を設定したい場合、ポートに必要なファイルを適切な場所と正しいユーザー権限で追加してから、enebular-agent を再起動しないといけません。詳細については、下記の「手動セットアップ」の項を参照してください。

### AWS IoT の Thing 自動作成とセットアップ

enebular-agent の AWS IoT ポートをインストールし、新しい AWS IoT の*モノ*を追加して利用するには、次の 4 つのオプションを設定します。

```
--aws-access-key-id=<AWSアカウントのアクセスキーID>
--aws-secret-access-key=<AWSアカウント秘密アクセスキー>
--aws-iot-region=<AWS IoTのリージョン>
--aws-iot-thing-name=<追加するモノの名前>
```

例えば、`pi` ユーザと `192.168.1.125` の IP アドレスを持つ Raspberry Pi デバイスに AWS IoT のポートをインストールし、 `raspberry-pi` という名前の AWS IoT の*モノ*を作成する場合のコマンドは次のようになります。

```sh
ssh -t pi@192.168.1.125 "wget -qO- https://enebular.com/agent-install | sudo -E bash -s -- --aws-iot-thing-name=raspberry-pi --aws-access-key-id=<my-key-id> --aws-secret-access-key=<my-access-key> --aws-iot-region=<my-region>"
```

インストールスクリプトに以下の AWS サービスのアクセス権限が必要になります。

- **IoT Core** - モノとその関連の証明書や、ポリシー、ルールの追加のために利用します

### Pelion の接続モード選択と認証情報インストール

enebular-agent の Pelion ポートをインストールするには、`--port`オプションで`pelion`を設定する必要があります。

Pelion の接続モードがデフォルトで開発者用モードになります。ファクトリーモードは`--mbed-cloud-mode`オプションで`factory`を設定して選択することができます。

Pelion ポートで必要となる認証情報を先にデバイスに転送してから、転送先を以下のオプションのいずれかで設定する必要があります。

```sh
--mbed-cloud-dev-cred=<Pelionの開発者用認証情報ファイルのパス>
--mbed-cloud-pal=<Pelionのファクトリー用認証情報palディレクトリのパス>
```

Pelionの接続モードに開発者用モードを選択した場合に`--mbed-cloud-dev-cred`オプションで開発者用の認証情報のパス、ファクトリーモードを選択した場合に`--mbed-cloud-pal`オプションでファクトリー用の認証情報（palディレクトリ）のパスを設定します。

例えば、`pi` ユーザと `192.168.1.125` の IP アドレスを持つ Raspberry Pi デバイスに Pelion の enebular-agent ポートを開発者用の認証情報と一緒にインストールする場合のコマンドは次のようになります。

```sh
scp mbed_cloud_dev_credentials.c pi@192.168.1.125:/tmp/
ssh -t pi@192.168.1.125 "wget -qO- https://enebular.com/agent-install | sudo -E bash -s -- --port=pelion --mbed-cloud-dev-cred=/tmp/mbed_cloud_dev_credentials.c"
```

### 確認方法

スクリプトが正常に完了すると、次のように処理結果のレポートが表示されます。

```
 enebular-agent has been successfully installed ✔
   - Version: <version>
   - Location: <directory>
   - User: enebular
   - Service name: enebular-agent-enebular

 enebular-agent is running as a system service.
 To check the status of agent, run the following command on the target device:
   sudo journalctl -ex -u enebular-agent-enebular.service
```

### 詳細情報

上記以外のオプションなどの詳細情報については、インストールスクリプトの readme ファイルを参照してください。

- [インストールスクリプトの README](tools/install/README.ja.md)

## 手動セットアップ

ここではインストールスクリプトを使用せずに enebular-agent を手動で設定する方法について説明します。

### インストール

enebular-agent を実行するには、利用する IoT プラットフォームのポートに必要となっている Node.js モジュールをインストールし、IoT プラットフォームの接続情報を正しく設定する必要があります。

必要なモジュールと接続情報は、各 IoT プラットフォームのポートによって異なります。enebular-agent の設定と実行の詳細については、各ポートの readme ファイルを参照してください。

- [AWS IoT ポートの README](ports/awsiot/README.ja.md)
- [Pelion ポートの README](ports/pelion/README.ja.md)

### 設定方法

enebular-agent は、環境変数で設定できる IoT プラットフォーム共通の設定オプションをいくつかサポートしています。例として以下のオプションがあります。

- `DEBUG` - 指定したログレベル（`debug`や`info`）でコンソールにロギングします。なお、`debug`に設定すればデバッグメッセージが enebular に送信されます

- `NODE_RED_DIR` - インストール済みの Node-RED のパス

- `NODE_RED_DATA_DIR` - Node-RED のワーキングディレクトリ（userDir）のパス

- `NODE_RED_COMMAND` - Node-RED を実行するためのコマンド

- `ENEBULAR_CONFIG_PATH` - enebular-agent の設定ファイルのパス

さらに、各ポートにはそれぞれの専用設定オプションがあります。詳細については、各ポートの readme ファイルを参照してください。

サポートされている設定オプションは、以下のようにポートの実行ファイルに`list-config-items`サブコマンドを指定して実行することによって一覧表示できます。

```sh
cd ports/<port>
./bin/enebular-<port>-agent list-config-items
```

AWS IoT を利用する場合、コマンドは次の通りです。

```sh
cd ports/awsiot
./bin/enebular-awsiot-agent list-config-items
```

### スタートアップ登録

enebular-agent は、Debian (systemd)ベースのデバイスで起動時に自動的に立ち上がるための設定を生成して登録する機能を持っています。この機能はポートの実行ファイルに`startup-register`サブコマンドと、適切な（起動時に使用される）ユーザを指定して利用します。

以下の例では、AWS IoT のポートを利用して、`startup-register`サブコマンドとユーザに`enebular`を指定する方法を示しています。

```sh
cd ports/awsiot
./bin/enebular-awsiot-agent startup-register -u enebular
```

以下の例の`ENEBULAR_LOG_LEVEL`オプションのように、その他に指定された設定オプションがキャプチャされてスタートアップ用の設定に含まれます。

```sh
ENEBULAR_LOG_LEVEL=debug ./bin/enebular-awsiot-agent startup-register -u enebular
```

スタートアップ用設定の登録をするためにはルート権限が必要です。`startup-register`サブコマンドがルート権限なしで実行された場合は、登録処理が行われずにかわりに`sudo`コマンドに指定して実行するべきコマンド内容がコンソールで表示されます。この場合、コンソールで表示される指示に従って適切な`sudo`コマンドを実行してください。

### 確認方法

自動的にスタートアップするための登録が完了してから、次のコマンドパターンを使用して systemd ジャーナルで enebular-agent の実行状態を確認することができます。

```sh
sudo journalctl -ex -u enebular-agent-<user>.service
```

ユーザが `enebular` に設定された場合、使用するコマンドは次の通りです。

```sh
sudo journalctl -ex -u enebular-agent-enebular.service
```

enebular-agent を再起動するには、次のコマンドを使用します。

```sh
sudo systemctl restart enebular-agent-enebular.service
```
