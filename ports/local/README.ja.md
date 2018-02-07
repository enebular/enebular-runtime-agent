
# Enebular Runtime Agent - Localポート

*Read this in other languages: [English](README.md), [日本語](README.ja.md)*

Localポートを使用すると、EnebularランタイムエージェントをUnixソケット経由で別のローカルプロセスと一緒に使用できます。このローカルプロセスは、IoTプラットフォーム接続のプロキシとして動作し、エージェントにコマンドを配信します。

ここではLocalポートの設定と実行の例を示します。この例で記載されているディレクトリは、エージェントのプロジェクトディレクトリのベースと想定して記述されています。 Node.jsとnpmが既にインストールされていることも前提としています。

## セットアップ

1. エージェントのコアモジュールをビルドします。

```
cd agent
npm install
npm run build
```

2. Node-REDのインスタンスをインストールします。

```
cd node-red
npm install
```

3. AWS IoTポートのモジュールをインストールしてビルドします。

```
cd ports/local
npm install
npm run build
```

## 実行


上記のセットアップが完了したら、エージェントは `npm run start`コマンドでLocalポートのディレクトリから起動できます。このコマンドと一緒に、Node-REDがインストールされているディレクトリを設定するようにNODE_RED_DIR環境変数も指定する必要があります。また、デフォルトの状態ではエージェントがコンソールにログを出力しませんが、`DEBUG`環境変数を` info`または `debug`のいずれかに設定することで出力するようにできます。

```
NODE_RED_DIR=../../node-red DEBUG=info npm run start
```

エージェントが正常に起動すると、次のログメッセージが表示されます。

```
internal: local: server listening on: "/tmp/enebular-local-agent.socket"
```

これが表示されると、エージェントはローカルのプロキシアプリケーションと一緒に使用できます。

## その他の設定オプション

エージェントのポートは、エージェントのコアを実行する時にさまざまなオプションを指定できます。AWS IoTポートの場合、このオプションの指定を`ports/awsiot/src/index.js`のソースコードで見ることができます。エージェントのコアがサポートするすべてのオプションには、`agent/src/index.js`のソースコードファイルを参照してください。
