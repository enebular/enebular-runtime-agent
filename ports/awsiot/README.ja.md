
# enebular-agent - AWS IoTポート

*Read this in other languages: [English](README.md), [日本語](README.ja.md)*

AWS IoTポートを使用すると、enebular-agentをAWS IoT接続で使用できます。

ここではAWS IoTポートの設定と実行の例を示します。この例で記載されているディレクトリは、エージェントのプロジェクトディレクトリをベースとして記述されています。 また、前提条件として、Node.jsとnpmが既にインストールされている必要があります。

## セットアップ

1. enebular-agentのコアモジュールをビルドします。

```
cd agent
npm install
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
```

4. AWS IoTポートのディレクトリの下に、「example」というAWS IoTポートをラップするだけのモジュールがあります。exampleモジュールのディレクトリに移動し、モジュールをインストールします。exampleモジュールの `package.json`ファイルを確認すると、Node-REDディレクトリを指定する環境変数が設定されていることが分かります。

```
cd ports/awsiot/example
npm install
```

5. このデバイスで使用するAWS IoT Thing用の証明書ファイルをAWSのコンソールなどから入手し、exampleモジュールのディレクトリににコピーします。

6. このデバイスで使用するAWS IoT Thingの接続情報をAWSのコンソールなどから取得します。証明書ファイルの正しいパスを含めて、この接続情報でexampleモジュールの `config.json`ファイルを更新します。

## 実行

上記のセットアップが完了したら、exampleモジュールのディレクトリから`npm run start`コマンドでenebular-agentが起動できます。

デフォルトの状態ではコンソールにログを出力しませんが、`DEBUG`環境変数を` info`または `debug`のいずれかに設定することで出力するようにできます。

```
DEBUG=info npm run start
```

enebular-agentが正常に起動してAWS IoTに接続すると、次のログメッセージが表示されます。

```
internal: aws-iot: Connected to AWS IoT
```

このメッセージが表示されると、enebularでデバイスを使用することができます。

## その他の設定オプション

enebular-agentのポートは、enebular-runtime-agentコアを実行する時にさまざまなオプションを指定できます。AWS IoTポートの場合、このオプションの指定を`ports/awsiot/src/index.js`のソースコードで見ることができます。enebular-runtime-agentコアがサポートするすべてのオプションには、`agent/src/index.js`のソースコードファイルを参照してください。
