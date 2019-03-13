
# enebular-agent アップデータ

*Read this in other languages: [English](README.md), [日本語](README.ja.md)*

このユーティリティを利用して以前にインストールスクリプトによってDebianベースのシステムにインストールされたenebular-agentを簡単に最新のバージョンにアップデートすることが出来ます。

アップデータ自体はNode.jsのアプリケーションになりますが、アップデータをワンステップで速く実行できるためのbashスクリプト（アップデートスクリプト）もあります。

## アップデートオプション

アップデートの実行時に以下のオプションを設定することが出来ます。

### ユーザ

enebular-agentが標準ではないユーザの下でインストールされている場合、アップデート時にもそのユーザを`--user`オプションで指定する必要があります。

### Pelionポートのモード

enebular-agentのPelionポートをアップデートする場合、`--pelion-mode`オプションで利用中のPelionモードを`developer` または`factory`に設定する必要があります。

## アップデートスクリプトによる簡単アップデート実行

アップデートスクリプトをターゲットのデバイスで実行するには、次に示すように wget を使用してダウンロードして実行します。

```sh
wget -qO- https://enebular.com/agent-update | sudo -E bash -s
```

アップデートのオプションは、以下のコマンドパターンのようにコマンドの末尾に`--`を追加してから指定します。

```sh
wget -qO- https://enebular.com/agent-update | sudo -E bash -s -- <option>
```

アップデートスクリプトは、次のコマンドパターンのように SSH 経由でリモートのデバイスで実行することもできます。

```sh
ssh -t <user>@<device-ip-address> "wget -qO- https://enebular.com/agent-update | sudo -E bash -s"
```

例えば、デフォルトの `pi` ユーザと `192.168.1.125` の IP アドレスを持つリモートの Raspberry Pi で Pelion ポートのモードに`factory`を指定してスクリプトを実行するコマンドは次のようになります。

```sh
ssh -t pi@192.168.1.125 "wget -qO- https://enebular.com/agent-update | sudo -E bash -s -- --pelion-mode=factory"
```

## アップデータの直接利用による手動アップデート実行

アップデートをワンステップで速く実行できるためアップデートスクリプトの利用をお勧めしますが、以下のようにアップデータを手動でターゲットのデバイスでソースからセットアップして直接に実行することも出来ます。

enebular-agentプロジェクトの中でアップデータのディレクトリに移動します。

```sh
cd tools/updater
```

アップデータのnpmパッケージをインストールします。

```sh
npm install
```

アップデータを実行します。

```sh
sudo ./bin/enebular-agent-update
```

## 確認方法

アップデータが正常に完了すると、次のように処理結果のメッセージが表示されます。

```sh
==== Starting enebular-agent <version> ====
OK
==== Verifying enebular-agent <version> ====
OK
Update succeeded ✔

```

## オプションの詳細

一般的によく利用されるオプションを下に示します。このオプションはアップデートスクリプトを実行する場合も、アップデータを直接に実行する場合も利用出来ます。

```sh
OPTION                       DESCRIPTION	
--user                       User under which enebular-agent has been installed
--pelion-mode                Pelion mode (developer or factory) selected when enebular-agent was installed
-h, --help                   Output usage information
```

サポートされている全てのオプションの一覧を表示するには、`-h`オプションを指定してアップデートスクリプトまたはアップデータを実行します。

## アップデートの流れ

以下にアップデートスクリプトとアップデータを実行する時のアップデート処理を説明します。

### アップデートスクリプト

1. 最新版のアップデータがダウンロードされ、一時的な場所に解凍されます。
1. アップデータが必要としているNode.jsのバージョン情報がアップデータのパッケージ定義ファイルから読み込まれます。
1. 必要としているNode.jsのバージョンが利用できる状態になっていない場合、ダウンロードされてインストールされます。
1. アップデータが実行されます。
1. アップデータが終了すると、一時的な場所から削除されます。

### アップデータ

1. The existing enebular-agent is found and interrogated.
1. Details of the existing enebular-agent are logged.
1. The new version of enebular-agent is downloaded and extracted to a temporary location.
1. The new enebular-agent is set up. This includes installing any new system package dependencies and installing a new version of Node.js if required.
1. The existing enebular-agent is halted.
1. All existing enebular-agent configuration and data files are migrated to the new version.
1. The existing enebular-agent and new enebular-agent are swapped.
1. The new enebular-agent is started.
