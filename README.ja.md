
# enebular agent

*Read this in other languages: [English](README.md), [日本語](README.ja.md)*

enebular-agentは、Linuxデバイス用のNode.jsベースのIoTエージェントソフトウェアです。 eneublar-agentはenebularと連携して、Node-REDのフローをIoTデバイスにデプロイして実行することができます。また、IoTデバイスの状態をenebularに通知します。

enebular-agentには次の主要機能があります。

- IoTデバイス（エージェント）の登録と認証
- Node-REDインスタンスの管理とenebularから送られたフローのデプロイと実行
- enebularへのステータス通知およびログ送信

enebularは、サードパーティのIoTプラットフォーム接続を介してenebular-agentと通信します。 サポートされているIoTプラットフォームの接続タイプは次のとおりです。

 - AWS IoT

## 構成

enebular-agentは、Node.jsモジュールの集合として実装されています。enebular-agentのコアランタイム機能は`enebular-runtime-agent`モジュールとして（`agent`ディレクトリの下で）実装されています。この上に、サポートされているIoTプラットフォームの接続タイプごとにモジュールが（`ports`ディレクトリの下に）あります。 各ポートがenebular-runtime-agentコアのモジュールを依存モジュールとして含んでいます。

Node-REDもNode.jsのモジュールとしてインストールされます。

## 設定方法

enebular-runtime-agentコアは、IoTプラットフォーム共通の設定オプションをいくつかサポートしています。例として以下のオプションがあります。

- ログレベル
- コンソールへのログ出力のオン/オフ
- enebularログ用のキャッシュのサイズや場所など
- Node-REDインスタンスの場所（path）と実行コマンド

enebular-runtime-agentコアの設定オプションは、enebular-runtime-agentコアがポートによって実行される時に設定されます。 設定方法の詳細には、各ポートを参照してください。

## 利用方法

enebular-agentを実行するには、必要なNode.jsモジュールをnpmなどでインストールし、IoTプラットフォームの接続情報を正しく設定する必要があります。必要なモジュールと接続情報は、各IoTプラットフォームによって異なります。

enebular-agentの設定と実行の詳細については、各ポートのreadmeファイルを参照してください。

- [AWS IoT](ports/awsiot/README.ja.md)
