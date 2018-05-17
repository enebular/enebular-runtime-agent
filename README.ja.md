
# enebular-agent

*Read this in other languages: [English](README.md), [日本語](README.ja.md)*

enebular-agentは、Linuxデバイス用のNode.jsベースのIoTエージェントソフトウェアです。 eneublar-agentはenebularと連携して、Node-REDのフローをIoTデバイスにデプロイして実行することができます。また、IoTデバイスの状態をenebularに通知します。

enebular-agentには次の主要機能があります。

- IoTデバイス（エージェント）のアクティベーションと登録、認証
- Node-REDインスタンスの管理とenebularから送られたフローのデプロイと実行
- enebularへのステータス通知およびログ送信

enebularは、サードパーティのIoTプラットフォーム接続を介してenebular-agentと通信します。

## 機能

### アクティベーションと登録、認証

TODO

### Node-REDのフロー

TODO

### ロギング

TODO

### ステータス通知

TODO

## 構成

enebular-agentは、Node.jsモジュールの集合として実装されています。enebular-agentのコアランタイム機能は`enebular-runtime-agent`モジュールとして（`agent`ディレクトリの下で）実装されています。この上に、サポートされているIoTプラットフォームの接続タイプごとにモジュールが（`ports`ディレクトリの下に）あります。 各ポートがenebular-runtime-agentコアのモジュールを依存モジュールとして含んでいます。

Node-REDもNode.jsのモジュールとしてインストールされます。

## インストール方法

enebular-agentを実行するには、利用するIoTプラットフォームのポートに必要となっているNode.jsモジュールをインストールし、IoTプラットフォームの接続情報を正しく設定する必要があります。

必要なモジュールと接続情報は、各IoTプラットフォームのポートによって異なります。enebular-agentの設定と実行の詳細については、各ポートのreadmeファイルを参照してください。

- [ポート](ports)

## 設定方法

enebular-agentは、環境変数で設定できるIoTプラットフォーム共通の設定オプションをいくつかサポートしています。例として以下のオプションがあります。

- `DEBUG` -  指定したログレベル（`debug`や`info`）でコンソルにロギングします。なお、`debug`に設定すると、enebular-agentが認証されているとしたらデバッグメッセージがenebularにも送信されます。

- `NODE_RED_DIR` - インストール済みのNode-REDのパス

- `NODE_RED_DATA_DIR` - Node-REDのワーキングディレクトリ（userDir）のパス

- `NODE_RED_COMMAND` - Node-REDを実行するためのコマンド

- `ENEBULAR_CONFIG_PATH` - enebular-agentの設定ファイルのパス

- `ACTIVATOR` - 利用するアクティベーション用のモジュール

さらに、各ポートにはそれぞれの専用設定オプションがあります。詳細については、各ポートのreadmeファイルを参照してください。
