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

The install script will create the activation configuration file for enebular-agent if the `--license-key` option is provided.

## ポートの手動設定

While this script will fully install enebular-agent and set it up to run at system startup, as enebular-agent also needs additional configuration specific to the selected port, if you didn't select to automatically add an AWS IoT thing then enebular-agent will actually fail to run to start with.

To have enebular-agent run correctly, add the required files for the port (in the correct location and with the correct user permissions) as specified in the enebular-agent READMEs and then restart enebular-agent.

See the *Post Install* section below for information on how to restart enebular-agent and check its runtime state.

## インストール完了後

Once installed, you should be able to check the status of the enebular-agent with the systemd journal using the following command pattern.

```sh
sudo journalctl -ex -u enebular-agent-<user>.service
```

By default the user is set to `enebular`, and therefore the command to use is:

```sh
sudo journalctl -ex -u enebular-agent-enebular.service
```

To restart enebular-agent, use the following command.

```sh
sudo systemctl restart enebular-agent-enebular.service
```

## Node.jsのバージョン

The supported Node.js version is as defined in the offical enebular documentation. If the install script can't find an existing installation of this version, it will try to install a prebuilt release from nodejs.org.

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
