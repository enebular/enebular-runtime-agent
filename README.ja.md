
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

enebular-agentがenebularと通信するには、「登録情報」を取得する必要があります。この登録情報の取得には２つの方法が用意されています。

- enebularがIoTプラットフォーム接続経由で登録情報を自動的にenebular-agentに送信する
- enebular-agentがenebularに「アクティベーション」を直接に要求した時のレスポンスとして受信する

基本的に前者で登録情報を取得します。また、後者のアクティベーションについては[activationのreadmeファイル](README-activation.ja.md)に更なる詳細情報が記載されています。

ロギングやステータス通知のようにデバイスの有償デバイス化が必要となっている機能の利用をenebular-agentに許可を与えるために、enebularはenebular-agentの認証情報を必要に応じて更新します。

### Node-REDのフロー

enebular-agentはenebularからデプロイされたフローをNode-REDで実行します。また、フローにnpmで公開されているノードが使用されている場合、そのノードを自動的にインストールします。

### ロギング

enebular-agentは有償デバイスの場合、定期的にenebularにログメッセージを送信します。また、標準出力ストリーム（コマンドラインのコンソールなど）にもロギングできますが、デフォルトでは有効になっていません。ロギングするには、`DEBUG`環境変数を設定します。

enebular-agentはenebular-agent自身のロギングの他に、Node-REDが標準出力と標準エラー出力（stdoutとstderr）に出力するメッセージをキャプチャしてロギングします。Node-REDが出力するメッセージは全てinfoレベルでロギングされます。また、実行中のフローに含まれているノードからのメッセージもロギングします（debugノードで"debug tab and console"の設定がされている場合など）。


### ステータス通知

enebular-agentは有償デバイスの場合に簡易なステータス情報をenebularに送信します。

## 構成

enebular-agentは、Node.jsモジュールの集合として実装されています。enebular-agentのコアランタイム機能は`enebular-runtime-agent`モジュールとして（`agent`ディレクトリの下で）実装されています。この上に、サポートされているIoTプラットフォームの接続タイプごとにモジュールが（`ports`ディレクトリの下に）あります。 各ポートがenebular-runtime-agentコアのモジュールを依存モジュールとして含んでいます。

Node-REDもNode.jsのモジュールとしてインストールされます。

## インストール方法

enebular-agentを実行するには、利用するIoTプラットフォームのポート(※)に必要となっているNode.jsモジュールをインストールし、IoTプラットフォームの接続情報を正しく設定する必要があります。

必要なモジュールと接続情報は、各IoTプラットフォームのポートによって異なります。enebular-agentの設定と実行の詳細については、各ポートのreadmeファイルを参照してください。

- [ポート](ports)

※ここでのポートは、enebular-agentをAWSIoTやmbedcloudｍなどの外部サービスと接続するのに使うコネクタを指します。

## 設定方法

enebular-agentは、環境変数で設定できるIoTプラットフォーム共通の設定オプションをいくつかサポートしています。例として以下のオプションがあります。

- `DEBUG` -  指定したログレベル（`debug`や`info`）でコンソールにロギングします。なお、`debug`に設定し、且つenebular-agentが有償デバイスであればデバッグメッセージがenebularに送信されます

- `NODE_RED_DIR` - インストール済みのNode-REDのパス

- `NODE_RED_DATA_DIR` - Node-REDのワーキングディレクトリ（userDir）のパス

- `NODE_RED_COMMAND` - Node-REDを実行するためのコマンド

- `ENEBULAR_CONFIG_PATH` - enebular-agentの設定ファイルのパス

さらに、各ポートにはそれぞれの専用設定オプションがあります。詳細については、各ポートのreadmeファイルを参照してください。
