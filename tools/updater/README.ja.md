
# enebular-agent アップデータ

*Read this in other languages: [English](README.md), [日本語](README.ja.md)*

このユーティリティを利用して以前にインストールスクリプトによってDebianベースのシステムにインストールされたenebular-agentを簡単に最新のバージョンにアップデートすることが出来ます。

アップデータ自体はNode.jsのアプリケーションになりますが、アップデータをワンステップで速く実行できるためのbashスクリプト（アップデートスクリプト）もあります。

## 対象バージョン

アップデータを利用してバージョン2.4.0以降のenebular-agentをアップデートできます。

## アップデートの主なオプション

アップデートの実行時に必要に応じて以下のオプションを設定します。

### ユーザ

enebular-agentが標準ではないユーザの下でインストールされている場合、アップデート時にもそのユーザを`--user`オプションで指定する必要があります。

### Pelionポートのモード

enebular-agentのPelionポートをアップデートする場合、`--pelion-mode`オプションで利用中のPelionモードを`developer` または`factory`に設定する必要があります。

### 自動起動が無効の場合

enebular-agentが`--no-startup-register`オプションでインストールされている場合、アップデート時にenebular-agentのインストールディレクトリを`--install-dir`オプションで指定する必要があります。

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
--user                       enebular-agentがインストールされているユーザ
--pelion-mode                enebular-agentがインストールされた時のPelionモード (developerまたはfactory)
-h, --help                   利用情報を出力する
```

サポートされている全てのオプションの一覧を表示するには、`-h`オプションを指定してアップデートスクリプトまたはアップデータを実行します。

## アップデートの流れ

以下にアップデートスクリプトとアップデータを実行する時のアップデート処理を説明します。

### アップデートスクリプト

1. 最新版のアップデータがダウンロードされて、一時的な場所に解凍されます。
1. アップデータが必要としているNode.jsのバージョン情報がアップデータのパッケージ定義ファイルから読み込まれます。
1. 必要としているNode.jsのバージョンが利用できる状態になっていない場合、ダウンロードされてインストールされます。
1. アップデータが実行されます。
1. アップデータが終了すると、一時的な場所から削除されます。

### アップデータ

1. 既存のenebular-agentが検知されて、インストール関連の詳細がチェックされます。
1. 既存のenebular-agentの詳細がログされます。
1. 新しいバージョンのenebular-agentがダウンロードされて、一時的な場所に解凍されます。
1. 新しいenebular-agentがセットアップされます。このセットアップ処理では新規の依存システムパッケージのインストールや、必要に応じてNode.jsの新しいバージョンのインストール処理が含まれます。
1. 既存のenebular-agentが停止されます。
1. 既存のenebular-agentの設定やデータファイルが新しいenebular-agentにマイグレーションされます。
1. 既存のenebular-agentと新しいenebular-agentが交換されます。
1. 新しいenebular-agentが起動されます。

なお、アップデート時にenebular-agentがすでに停止していた場合でも、アップデート処理の最後で起動されます。
