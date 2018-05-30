
# enebular-agent - アクティベーション

*Read this in other languages: [English](README-enebular-activator.md), [日本語](README-enebular-activator.ja.md)*

enebular-agentはenebularとのアクティベーションをサポートしています。
アクティベーションとは、reserve状態になっているライセンスをデバイスと紐づけて有償デバイスにする機能です。

## 利用方法

アクティベーション用の有効な設定ファイルが保存されている場合にenebular-agentが適切なタイミングでアクティベーションを行います。

## 設定方法

アクティベーション用の設定ファイルのパスはデフォルトで`.enebular-activation-config.json`となっています。
この設定は、 `ACTIVATOR_CONFIG_PATH` 環境変数で違うパスに指定することができます。

設定ファイルは以下の例のように `enebularBaseURL` と `licenseKey` の値を含む必要があります。

```
{
	"enebularBaseURL": "https://enebular.com/api/v1",
	"licenseKey": "<KEY>"
}
```
