
# enebular-agent - Localポート

*Read this in other languages: [English](README.md), [日本語](README.ja.md)*

Localポートを使用すると、enebular-runtime-agentをUnixソケット経由で別のローカルプロセスと一緒に使用できます。このローカルプロセスは、IoTプラットフォーム接続のプロキシとして動作し、エージェントにコマンドを配信します。

ここではLocalポートの設定と実行の例を示します。この例で記載されているディレクトリは、エージェントのプロジェクトディレクトリのベースと想定して記述されています。 また、Node.js(8.9.0)とnpm(5.5.1)が既にインストールされていることを前提としています。

## セットアップ

※詳しくは、[enebular-docs](https://docs.enebular.com/)を参照してください。

1 . エージェントのコアモジュールをインストールします。

```
cd agent
npm install
```

2 . Node-REDのインスタンスをインストールします。

```
cd node-red
npm install
```

3 .  Localポートのモジュールをインストールします。

```
cd ports/local
npm install
```

## 実行


上記のセットアップが完了したら、エージェントは `npm run start`コマンドでLocalポートのディレクトリから起動できます。このコマンドと一緒に、Node-REDがインストールされているディレクトリを設定するように`NODE_RED_DIR`環境変数も指定する必要があります。また、デフォルトの状態ではエージェントがコンソールにログを出力しませんが、`DEBUG`環境変数を` info`または `debug`のいずれかに設定することで出力するようにできます。

```
NODE_RED_DIR=../../node-red DEBUG=info npm run start
```

エージェントが正常に起動すると、次のログメッセージが表示されます。

```
internal: local: server listening on: "/tmp/enebular-local-agent.socket"
```

これが表示されると、エージェントはローカルのプロキシアプリケーションと一緒に使用できます。

## その他の設定オプション

IoTプラットフォーム共通の設定オプションについては、[プロジェクトのreadmeファイル](../../README.ja.md)を参照してください。
