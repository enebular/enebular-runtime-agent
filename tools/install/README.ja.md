# enebular-agentのインストール

これはDebianベースのシステムでeneblar-agentのワンステップインストールを提供するbashスクリプトのユーティリティです。

## ローカルのインストール

インストールスクリプトをターゲットのデバイスで直接に使用するには、次に示すようにwgetを使用してダウンロードして実行します。

```sh
wget -qO- https://raw.githubusercontent.com/enebular/enebular-runtime-agent/master/tools/install/install.sh | sudo -E bash -s
```

## リモートのインストール

インストールスクリプトは、次のコマンドパターンのようにSSH経由でリモートのデバイスで実行することもできます。

```sh
ssh -t <user>@<device-ip-address> "wget -qO- https://raw.githubusercontent.com/enebular/enebular-runtime-agent/master/tools/install/install.sh | sudo -E bash -s"
```

その例として、デフォルトの `pi` ユーザと `192.168.1.125` のIPアドレスを持つリモートのRaspberry Piでスクリプトを実行するコマンドは次のようになります。

```sh
ssh -t pi@192.168.1.125 "wget -qO- https://raw.githubusercontent.com/enebular/enebular-runtime-agent/master/tools/install/install.sh | sudo -E bash -s"
```

## ユーザ

デフォルトでは、enebular-agentが `enebular` ユーザとして実行されるようにインストールされます。そのユーザが存在しない場合はインストールスクリプトが追加します。

## ポート

デフォルトでは、enebular-agentのAWS IoTポートがインストールされます。その他のポートを選択するには、下記「オプション」の項を参照してください。

## AWS IoTのThing作成

インストールスクリプトは、enebular-agentが使用するためのAWS IoT上のThingを自動的に作成する機能を持っています。

Thingを作成するには、次の4つのオプションを指定する必要があります。

```sh
--aws-access-key-id
--aws-secret-access-key
--aws-iot-region
--aws-iot-thing-name
```

この機能は、秘密のアクセスキーがデバイスに（bashの履歴内で）記録されないように、インストールスクリプトをリモートで実行する場合のみに利用するのが望ましいです。

生成される鍵と証明書は、デフォルトで `/home/enebular/enebular-runtime-agent/ports/awsiot/certs` の下に保存されます。 利用者が必要に応じて鍵と証明書を安全な方法でバックアップするようにしないといけません。

AWS IoTのThingを作成するコマンドの例については、下記「事例」の項を参照してください。

## アクティベーション

`--license-key` オプションを指定するとインストールスクリプトがenebular-agentのアクティベーション用の設定ファイルを作成します。

## ポートの手動設定

このスクリプトはenebular-agentを完全にインストールし、システム起動時に実行されるように設定しますが、選択したポート固有の設定も必要なため、AWS IoTのThingの自動作成を選択しなかった場合、そのままだと起動が失敗します。

この場合、enebular-agentを正しく実行させるには、enebular-agentのreadmeファイルの説明に従って、ポートに必要なファイルを適切な場所と正しいユーザー権限で追加してから、enebular-agentを再起動します。

enebular-agentの再起動方法と実行状態の確認方法については、下記「インストール完了後」の項を参照してください。

## インストール完了後

インストールが完了してから、次のコマンドパターンを使用してsystemdジャーナルでenebular-agentの実行状態を確認することができます。

```sh
sudo journalctl -ex -u enebular-agent-<user>.service
```

デフォルトの `enebular` ユーザの場合、使用するコマンドは次の通りです。

```sh
sudo journalctl -ex -u enebular-agent-enebular.service
```

enebular-agentを再起動するには、次のコマンドを使用します。

```sh
sudo systemctl restart enebular-agent-enebular.service
```

## Node.jsのバージョン

サポートされているNode.jsのバージョンは、enebularのドキュメントで定義されています。インストールスクリプトがこのバージョンの既存インストールを見つけられない場合、nodejs.orgから事前にビルドされたリリースをインストールします。

## オプション

```sh
OPTION                      FORMAT              DEFAULT                              DESCRIPTION
-p or --port                -p=[local,awsiot]   awsiot                               Port to install
-u or --user                -u=*                enebular                             User to run as after being installed
-d or --install-dir         -d=<path>           /home/<user>/enebular-runtime-agent  Install directory
-v or --release-version     -v=*                The latest release                   Release version of enebular-agent
--no-startup-register       N/A                 N/A                                  Do not register system startup configuration
--aws-access-key-id         =*                  N/A                                  AWS access key ID
--aws-secret-access-key     =*                  N/A                                  AWS secret access key
--aws-iot-region            =*                  N/A                                  AWS IoT region
--aws-iot-thing-name        =*                  N/A                                  AWS IoT thing name
--license-key               =*                  N/A                                  Enebular licence key to activate
```

## 事例

Install the AWS IoT enebular-agent port and create a AWS IoT thing named "raspberry-pi" on a Raspberry Pi device via SSH (with the `pi` user and IP address of `192.168.1.125`).

```sh
ssh -t pi@192.168.1.125 "wget -qO- https://raw.githubusercontent.com/enebular/enebular-runtime-agent/master/tools/install/install.sh | sudo -E bash -s -- --aws-iot-thing-name=raspberry-pi --aws-access-key-id=<my-key-id> --aws-secret-access-key=<my-access-key> --aws-iot-region=<my-region>"
```

Install the AWS IoT enebular-agent port using the `2.1.2` release.

```sh
wget -qO- https://raw.githubusercontent.com/enebular/enebular-runtime-agent/master/tools/install/install.sh | sudo -E bash -s -- -v=2.1.2
```

Install the AWS IoT enebular-agent port using the `2.1.3` release with the user set to `enebular-user-test`, the install directory set to `/home/enebular-user-test/my-agent`, and startup registration disabled.

```sh
wget -qO- https://raw.githubusercontent.com/enebular/enebular-runtime-agent/master/tools/install/install.sh | sudo -E bash -s -- -v=2.1.3 --user=enebular-user-test -d=/home/enebular-user-test/my-agent --no-startup-register
```
