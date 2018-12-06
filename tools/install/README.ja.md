# enebular-agent のインストールスクリプト

_Read this in other languages: [English](README.md), [日本語](README.ja.md)_

これは Debian ベースのシステムで eneblar-agent のワンステップインストールを提供する bash スクリプトのユーティリティです。

## ローカルのインストール

インストールスクリプトをターゲットのデバイスで直接に使用するには、次に示すように wget を使用してダウンロードして実行します。

```sh
wget -qO- https://enebular.com/agent-install | sudo -E bash -s
```

## リモートのインストール

インストールスクリプトは、次のコマンドパターンのように SSH 経由でリモートのデバイスで実行することもできます。

```sh
ssh -t <user>@<device-ip-address> "wget -qO- https://enebular.com/agent-install | sudo -E bash -s"
```

例えば、デフォルトの `pi` ユーザと `192.168.1.125` の IP アドレスを持つリモートの Raspberry Pi でスクリプトを実行するコマンドは次のようになります。

```sh
ssh -t pi@192.168.1.125 "wget -qO- https://enebular.com/agent-install | sudo -E bash -s"
```

## ユーザ

デフォルトでは、enebular-agent が `enebular` ユーザとして実行されるようにインストールされます。そのユーザが存在しない場合はインストールスクリプトが追加します。

## ポート

デフォルトでは、enebular-agent の AWS IoT ポートがインストールされます。その他のポートを選択するには、下記「オプション」の項を参照してください。

## AWS IoT の Thing 作成

インストールスクリプトは、enebular-agent が使用するための AWS IoT 上のモノを自動的に作成する機能を持っています。

モノを作成するには、次の 4 つのオプションを設定する必要があります。

```sh
--aws-access-key-id
--aws-secret-access-key
--aws-iot-region
--aws-iot-thing-name
```

この機能は、秘密のアクセスキーがデバイスに（bash の履歴内で）記録されないように、インストールスクリプトをリモートで実行する場合のみに利用するのが望ましいです。

生成される鍵と証明書は、デフォルトで `/home/enebular/enebular-runtime-agent/ports/awsiot/certs` の下に保存されます。 利用者が必要に応じて鍵と証明書を安全な方法でバックアップするようにしないといけません。

AWS IoT のモノを作成するコマンドの例については、下記「実行例」の項を参照してください。

## アクティベーション

`--license-key` オプションを指定するとインストールスクリプトが enebular-agent のアクティベーション用の設定ファイルを作成します。

## ポートの手動設定

このスクリプトは enebular-agent を全てインストールし、システム起動時に実行されるように設定します。しかし、選択したポート固有の設定も必要なため、AWS IoT の Thing の自動作成を選択しなかった場合、そのままだと起動が失敗します。

この場合、enebular-agent を正しく実行させるには、enebular-agent の readme ファイルの説明に従って、ポートに必要なファイルを適切な場所と正しいユーザー権限で追加してから、enebular-agent を再起動します。

enebular-agent の再起動方法と実行状態の確認方法については、下記「インストール完了後」の項を参照してください。

## インストール完了後

インストールが完了してから、次のコマンドパターンを使用して systemd ジャーナルで enebular-agent の実行状態を確認することができます。

```sh
sudo journalctl -ex -u enebular-agent-<user>.service
```

デフォルトの `enebular` ユーザの場合、使用するコマンドは次の通りです。

```sh
sudo journalctl -ex -u enebular-agent-enebular.service
```

enebular-agent を再起動するには、次のコマンドを使用します。

```sh
sudo systemctl restart enebular-agent-enebular.service
```

## Node.js のバージョン

サポートされている Node.js のバージョンは、enebular のドキュメントで定義されています。インストールスクリプトがこのバージョンの既存インストールを見つけられない場合、nodejs.org から事前にビルドされたリリースをインストールします。

## オプション

```sh
OPTION                      FORMAT              DEFAULT                              DESCRIPTION
-p or --port                -p=[mbed,awsiot]    awsiot                               インストールするポート
-u or --user                -u=*                enebular                             インストール後の実行ユーザ
-d or --install-dir         -d=<path>           /home/<user>/enebular-runtime-agent  インストール先のディレクトリ
-v or --release-version     -v=*                The latest release                   enebular-agentのリリース
--no-startup-register       N/A                 N/A                                  システム起動時用のスタートアップ登録をしない
--aws-access-key-id         =*                  N/A                                  AWS access key ID
--aws-secret-access-key     =*                  N/A                                  AWS secret access key
--aws-iot-region            =*                  N/A                                  AWS IoTのリージョン
--aws-iot-thing-name        =*                  N/A                                  AWS IoTのモノ名
--license-key               =*                  N/A                                  アクティベーション用のライセンスキー
```

## 実行例

Raspberry Pi デバイスに `pi` ユーザと `192.168.1.125` の IP アドレスで SSH を介して AWS IoT の enebular-agent ポートをインストールし、`raspberry-pi`という名前の AWS IoT のモノを作成します。

```sh
ssh -t pi@192.168.1.125 "wget -qO- https://enebular.com/agent-install | sudo -E bash -s -- --aws-iot-thing-name=raspberry-pi --aws-access-key-id=<my-key-id> --aws-secret-access-key=<my-access-key> --aws-iot-region=<my-region>"
```

`2.1.2` リリースを使用して AWS IoT の enebular-agent ポートをインストールします。

```sh
wget -qO- https://enebular.com/agent-install | sudo -E bash -s -- -v=2.1.2
```

ユーザを `enebular-user-test` に、インストール先のディレクトリを `/home/enebular-user-test/my-agent` に、スタートアップ登録なしで `2.1.3` のリリースを使用して AWS IoT の enebular-agent ポートをインストールします。

```sh
wget -qO- https://enebular.com/agent-install | sudo -E bash -s -- -v=2.1.3 --user=enebular-user-test -d=/home/enebular-user-test/my-agent --no-startup-register
```
