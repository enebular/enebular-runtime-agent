
# enebular-agent - Pelionポート

*Read this in other languages: [English](README.md), [日本語](README.ja.md)*

Pelionポートを使用すると、enebular-agentをArm Pelionの接続で使用できます。

ここではPelionポートの設定と実行の例を示します。この例で記載されているディレクトリは、エージェントのプロジェクトディレクトリをベースとして記述されています。 また、前提条件として、Node.js(9.2.1)とnpm(5.5.1)が既にインストールされている必要があります。

## セットアップ

※詳しくは、[enebular-docs](https://docs.enebular.com/)を参照してください。

1 . enebular-agentのコアモジュールをインストールします。

```
cd agent
npm ci && npm run build
```

2 . Node-REDのインスタンスをインストールします。

```
cd node-red
npm ci
```

3 . Pelionポートのモジュールをインストールします。

```
cd ports/pelion
npm ci && npm run build
```

4 . toolsディレクトリに含まれているmbed-cloud-connectorを[readmeファイル](../../tools/mbed-cloud-connector/README.ja.md)に従ってセットアップします。

## 実行

上記のセットアップが完了したら、Pelionポートのディレクトリから`npm run start`コマンドでenebular-agentが起動できます。

デフォルトの状態ではコンソールにログを出力しませんが、`DEBUG`環境変数を` info`または `debug`のいずれかに設定することで出力するようにできます。

```
DEBUG=info npm run start
```

enebular-agentが正常に起動してPelionに接続すると、次のログメッセージが表示されます。

```
internal: pelion: conntector: Mbed Cloud: Client: connected
```

このメッセージが表示されると、enebularでデバイスを使用することができます。

## その他の設定オプション

IoTプラットフォーム共通の設定オプションについては、[プロジェクトのreadmeファイル](../../README.ja.md)を参照してください。
