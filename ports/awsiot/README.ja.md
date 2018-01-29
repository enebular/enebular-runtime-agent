
# Enebular Runtime Agent - AWS IoTポート

*Read this in other languages: [English](README.md), [日本語](README.ja.md)*

AWS IoTポートを使用すると、EnebularランタイムエージェントをAWS IoTの接続で使用できます。

ここではAWS IoTポートの設定と実行の例を示します。この例で記載されているディレクトリは、エージェントのプロジェクトディレクトリのベースと想定して記述されています。 Node.jsとnpmが既にインストールされていることも前提としています。

## セットアップ

1. エージェントのコアモジュールをビルドします。

```
cd agent
npm run build
```

2. Node-REDのインスタンスをインストールします。

```
cd node-red
npm install
```

3. AWS IoTポートのモジュールをインストールしてビルドします。

```
cd ports/awsiot
npm install
npm run build
```

4. AWS IoTポートのディレクトリの下に、AWS IoTポートを単にラップする「example」という例のモジュールがあります。exampleモジュールのディレクトリに移動し、モジュールをインストールします。exampleモジュールの `package.json`ファイルを確認すると、Node-REDディレクトリを指定する環境変数が設定されていることが分かります。

```
cd ports/awsiot/example
npm install
```

5. このデバイスで使用するAWS IoT Thing用の証明書ファイルをAWSのコンソールなどから入手し、exampleモジュールのディレクトリににコピーします。

6. このデバイスで使用するAWS IoT Thingの接続情報をAWSのコンソールなどから取得し、証明書ファイルの正しいパスを含めて、この接続情報でexampleモジュールの `config.json`ファイルを更新します。

## 実行

上記のセットアップが完了したら、エージェントは `npm run start`コマンドでexampleモジュールのディレクトリから起動できます。

デフォルトの状態ではエージェントがコンソールにログを出力しませんが、`DEBUG`環境変数を` info`または `debug`のいずれかに設定することで出力するようにできます。

```
DEBUG=info npm run start
```

エージェントが正常に起動してAWS IoTに接続すると、次のログメッセージが表示されます。

```
internal: aws-iot: Connected to AWS IoT
```

これが表示されると、Enebularでデバイスを使用することができます。

## その他の設定オプション

エージェントのポートは、エージェントのコアを実行する時にさまざまなオプションを指定できます。AWS IoTポートの場合、このオプションの指定を`ports/awsiot/src/index.js`のソースコードで見ることができます。エージェントのコアがサポートするすべてのオプションには、`agent/src/index.js`のソースコードファイルを参照してください。
