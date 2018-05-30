
# enebular-agent - AWS IoTポート

*Read this in other languages: [English](README.md), [日本語](README.ja.md)*

AWS IoTポートを使用すると、enebular-agentをAWS IoTの接続で使用できます。

ここではAWS IoTポートの設定と実行の例を示します。この例で記載されているディレクトリは、エージェントのプロジェクトディレクトリをベースとして記述されています。 また、前提条件として、Node.js(8.9.0)とnpm(5.5.1)が既にインストールされている必要があります。

## セットアップ

※詳しくは、[enebular-docs](https://docs.enebular.com/)を参照してください。

1 . enebular-agentのコアモジュールをインストールします。

```
cd agent
npm install
```

2 . Node-REDのインスタンスをインストールします。

```
cd node-red
npm install
```

3 . AWS IoTポートのモジュールをインストールします。

```
cd ports/awsiot
npm install
```

4 . AWS IoTポートのディレクトリの下に、「example」というAWS IoTポートを「らっぷ」するモジュールがあります。exampleモジュールのディレクトリに移動し、モジュールをインストールします。
※exampleモジュールの `package.json`ファイルには、Node-REDディレクトリを指定する環境変数が設定されています。

```
cd ports/awsiot/example
npm install
```

5 . このデバイスで使用するAWS IoT Thing用の証明書ファイルをAWSのコンソールなどから入手し、exampleモジュールのディレクトリにコピーします。

6 . このデバイスで使用するAWS IoT Thingの接続情報をAWSのコンソールなどから取得します。証明書ファイルの正しいパスを含めて、この接続情報でexampleモジュールの `config.json`ファイルを更新します。

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

IoTプラットフォーム共通の設定オプションについては、[プロジェクトのreadmeファイル](../../README.ja.md)を参照してください。
