
# enebular-agent

*Read this in other languages: [English](README.md), [日本語](README.ja.md)*

enebular-agentは、Linux OSを搭載したゲートウェイ向けのenebular用IoTエージェントソフトウェアです。 eneublar-agentはenebularと連携して、Node-REDのフローをIoTデバイスにデプロイして実行することができます。また、IoTデバイスの状態をenebularに通知します。

enebular-agentには次の主要機能があります。

- IoTデバイス（エージェント）のアクティベーションと登録、認証
- Node-REDインスタンスの管理とenebularからデプロイされたフローの実行
- enebularへのステータス通知およびログ送信

enebularは、サードパーティのIoTプラットフォーム接続を介してenebular-agentと通信します。

## 機能

### アクティベーションと登録、認証

enebular-agentがenebularと通信するには、認証のための登録情報を取得する必要があります。この登録情報の取得には２つの方法が用意されています。

- enebularがIoTプラットフォーム接続経由で登録情報を自動的にenebular-agentに送信する
- enebular-agentがenebularに「アクティベーション」を直接に要求した時のレスポンスとして受信する

基本的に前者で登録情報を取得します。また、後者のアクティベーションについては[activationのreadmeファイル](README-activation.ja.md)に更なる詳細情報が記載されています。

ロギングやステータス通知のようにデバイスの有償デバイス化が必要となっている機能の利用をenebular-agentに許可を与えるために、enebularはenebular-agentの認証情報を必要に応じて更新します。

### Node-REDのフロー

enebular-agentはenebularからデプロイされたフローをNode-REDで実行します。また、フローにnpmで公開されているノードが使用されている場合、そのノードを自動的にインストールします。

### ロギング

enebular-agentは、定期的にenebularにログメッセージを送信します。標準出力ストリーム（コマンドラインのコンソールなど）にもロギングできますが、デフォルトでは有効になっていません。ロギングするには`DEBUG`環境変数を設定します。また、オプションでsyslogにロギングすることもできます。設定オプションの詳細については「設定方法」の項を参照してください。

enebular-agentは、Node-REDが標準出力と標準エラー出力（stdoutとstderr）に出力するメッセージをキャプチャしてロギングします。Node-REDが出力するメッセージは全てinfoレベルでロギングされます。また、実行中のフローに含まれているノードからのメッセージもロギングします（debugノードで"debug tab and console"の設定がされている場合など）。

ログをenebularで確認するには、対象デバイスが有償デバイスになっている必要があります。

### ステータス通知

enebular-agentは有償デバイスの場合に簡易なステータス情報をenebularに送信します。

## 構成

enebular-agentは、Node.jsモジュールの集合として実装されています。enebular-agentのコアランタイム機能は`enebular-runtime-agent`モジュールとして（`agent`ディレクトリの下で）実装されています。この上に、サポートされているIoTプラットフォームの接続タイプごとにモジュールが（`ports`ディレクトリの下に）あります。 各ポートがenebular-runtime-agentコアのモジュールを依存モジュールとして含んでいます。ポートの詳細情報については下記「ポート」の項を参照してください。

Node-REDもNode.jsのモジュールとしてインストールされます。

## ポート

ポートとは、enebular-agentをAWS IoTやMbed Cloudなどの外部サービスと連携するために個別に準備されたenebular-agentのエディションのことを指します。

enebular-agentを利用するには、利用する外部サービスに合わせて適切なポートを選択し、そのポートのインストールと設定を行ってから、ポートの`bin`ディレクトリの下にある実行ファイルを実行します。

現在、以下のポートがあります。

- **AWS IoT** - AWS IoTと連携して利用します
- **Local** - ローカルにある他のプログラムと併せて利用します
    - enebular-agentをMbed Cloudと連携して利用する場合に[enebular-agent Mbed Cloud Connector](https://github.com/enebular/enebular-runtime-agent-mbed-cloud-connector)と併せて利用します。

## クイックセットアップ

インストール用のスクリプトを使用してenebular-agentをRaspberry PiのようなDebianベースのデバイスで素早くセットアップできます。 このスクリプトはsshクライアントを使用して開発用のPC上のコマンドとして実行することをお勧めします。スクリプトの使用要件は以下の通りです。

- 開発用のPCにsshクライアントコマンドがインストールされていること
- ターゲットのデバイスに `sudo` コマンドがインストールされていること

また、ターゲットのデバイスに関する以下の情報も必要になります。

- ユーザログイン情報（ユーザ名とパスワード）
- 現在のIPアドレス

enebular-agentをAWS IoTと一緒に使用して、新しいThingを自動的に追加して利用したい場合は、次の情報が必要になります。

- AWSアカウントのアクセスキーID (access key ID)
- AWSアカウント秘密アクセスキー (secret access key)
- AWS IoTのリージョン
- 追加するThingの名前

### 基本的な利用方法

インストールスクリプトは、次のコマンドパターンのように開発用のPC上のSSHを使用してリモートのデバイスで実行できます。

```sh
ssh -t <user>@<device-ip-address> "wget -qO- https://raw.githubusercontent.com/enebular/enebular-runtime-agent/master/tools/install/install.sh | sudo -E bash -s"
```

上記のコマンドパターンではデフォルトでAWS IoT用のenebular-agentポートをインストールします。

事例として、リモートのRaspberry Piでデフォルトのpiユーザーと192.168.1.125のIPアドレスを使用してスクリプトを実行する場合のコマンドは次のようになります。

```sh
ssh -t pi@192.168.1.125 "wget -qO- https://raw.githubusercontent.com/enebular/enebular-runtime-agent/master/tools/install/install.sh | sudo -E bash -s"
```

上記のコマンドでenebular-agentのAWS IoTポートがインストールされますが、必要な接続情報がまだ設定されていないため、立ち上がることが出来ません。 新しいAWS IoTの*Thing*を自動的に追加して利用したい場合は、上記のコマンドの代わりに下記の「AWS IoTのThingの自動作成とセットアップ」の説明に従ってください。

手動で接続情報を設定したい場合、ポートに必要なファイルを適切な場所と正しいユーザー権限で追加してから、enebular-agentを再起動しないといけません。詳細については、下記の「手動セットアップ」の項を参照してください。

### AWS IoTのThingの自動作成とセットアップ

enebular-agentのAWS IoTポートをインストールし、新しいAWS IoTの*Thing*を追加して利用するには、次の4つのオプションを指定します。

```
--aws-access-key-id=<AWSアカウントのアクセスキーID>
--aws-secret-access-key=<AWSアカウント秘密アクセスキー>
--aws-iot-region=<AWS IoTのリージョン>
--aws-iot-thing-name=<追加するThingの名前>
```

その例として、`pi` ユーザと `192.168.1.125` のIPアドレスを持つRaspberry PiデバイスにAWS IoTのポートをインストールし、「raspberry-pi」という名前のAWS IoTの*Thing*を作成する場合のコマンドは次のようになります。

```sh
ssh -t pi@192.168.1.125 "wget -qO- https://raw.githubusercontent.com/enebular/enebular-runtime-agent/master/tools/install/install.sh | sudo -E bash -s -- --aws-iot-thing-name=raspberry-pi --aws-access-key-id=<my-key-id> --aws-secret-access-key=<my-access-key> --aws-iot-region=<my-region>"
```

### 確認方法

Once the script has completed successfully, it will display a report similar to the following.

```
 enebular-agent has been successfully installed ✔
 Version: <version>
 Location: <directory>
 User: enebular
 AWS IoT Thing <thing-name> has been created.
 enebular-agent is running as a system service.
 To check the status of agent, run the following command on the target device:
   sudo journalctl -ex -u enebular-agent-<user>.service
```

### 詳細情報

For more information about other options the install script has, please refer to its readme file.

- [Install script README](tools/install/README.md)

## 手動セットアップ

The following describes how to set up enebular-agent manually (without using the install script).

### インストール

enebular-agentを実行するには、利用するIoTプラットフォームのポートに必要となっているNode.jsモジュールをインストールし、IoTプラットフォームの接続情報を正しく設定する必要があります。

必要なモジュールと接続情報は、各IoTプラットフォームのポートによって異なります。enebular-agentの設定と実行の詳細については、各ポートのreadmeファイルを参照してください。

- [AWS IoTポートのREADME](ports/awsiot/README.ja.md)
- [LocalポートのREADME](ports/local/README.ja.md)

### 設定方法

enebular-agentは、環境変数で設定できるIoTプラットフォーム共通の設定オプションをいくつかサポートしています。例として以下のオプションがあります。

- `DEBUG` -  指定したログレベル（`debug`や`info`）でコンソールにロギングします。なお、`debug`に設定すればデバッグメッセージがenebularに送信されます

- `NODE_RED_DIR` - インストール済みのNode-REDのパス

- `NODE_RED_DATA_DIR` - Node-REDのワーキングディレクトリ（userDir）のパス

- `NODE_RED_COMMAND` - Node-REDを実行するためのコマンド

- `ENEBULAR_CONFIG_PATH` - enebular-agentの設定ファイルのパス

さらに、各ポートにはそれぞれの専用設定オプションがあります。詳細については、各ポートのreadmeファイルを参照してください。

サポートされている設定オプションは、以下のようにポートの実行ファイルに`list-config-items`サブコマンドを指定して実行することによって一覧表示できます。

```sh
cd ports/<port>
./bin/enebular-<port>-agent list-config-items
```

AWS IoTを利用する場合、コマンドは次の通りです。

```sh
cd ports/awsiot
./bin/enebular-awsiot-agent list-config-items
```

### スタートアップ登録

enebular-agentは、Debian (systemd)ベースのデバイスで起動時に自動的に立ち上がるための設定を生成して登録する機能を持っています。この機能はポートの実行ファイルに`startup-register`サブコマンドと、適切な（起動時に使用される）ユーザを指定して利用します。

以下の例では、AWS IoTのポートを利用して、`startup-register`サブコマンドとユーザに`enebular`を指定する方法を示しています。

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

Once it's registered to start up automatically, you should be able to check the status of the enebular-agent with the systemd journal using the following command pattern.

```sh
sudo journalctl -ex -u enebular-agent-<user>.service
```

If the user was set to `enebular`, the command to use will be:

```sh
sudo journalctl -ex -u enebular-agent-enebular.service
```

To restart enebular-agent, use the following command.

```sh
sudo systemctl restart enebular-agent-enebular.service
```
