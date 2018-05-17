
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

enebular-agentがenebularと通信するには、必要となる「登録情報」を取得しないといけません。この登録情報の取得には２つの方法がサポートされています。1) enebularがIoTプラットフォーム接続経由で登録情報を自動的にenebular-agentに送信します。2) enebular-agentがenebularに「アクティベーション」を直接に要求した時のレスポンスとして受信します。アクティベーションを利用するには、`ACTIVATOR`環境変数でアクティベーション用のモジュールを選択しないといけません。

アクティベーションを利用する特別な理由がない限り、enebularが自動的に登録情報を送信する方法を使います。サポートされているアクティベーション用のモジュールの詳細情報には、それぞれのreadmeファイルを参照してください。

enebularはロギングやステータス通知のように認証が必要となっている機能の利用をenebular-agentに許可を与えるために、enebular-agentの認証情報を必要に応じて更新します。

### Node-REDのフロー

enebular-agentはenebularからデプロイされたフローを受信し、そのフローを実行するためにNode-REDのインスタンスを管理します。また、デプロイされたフローで依存されているノードの公開モジュールを自動的にインストールします。

### ロギング

enebular-agentは自分のロギングの他に、Node-REDが標準出力ストリーム（stdoutとstderr）に出力するメッセージをキャプチャして再ロギングします。debugノードが"debug tab and console"に出力するように設定されている場合など、実行中のフローに含まれているノードからのメッセージも含まれます。現在、Node-REDからキャプチャされたメッセージが全てinfoのログレベルで再ロギングされます。

enebular-agentは認証されている場合に定期的にenebularにログメッセージを送信します。また、標準出力ストリーム（コマンドラインのコンソールなど）にもロギングできますが、デフォルトでは有効になっていません。コンソールにもロギングするには、`DEBUG`環境変数を設定します。

### ステータス通知

enebular-agentは認証されている場合に簡易なステータス情報をenebularに送信します。

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
