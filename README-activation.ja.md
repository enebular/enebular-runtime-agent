
# enebular-agent - アクティベーション

*Read this in other languages: [English](README-enebular-activator.md), [日本語](README-enebular-activator.ja.md)*

enebular-agentはenebularとのアクティベーションをサポートしています。

## 利用方法

有効なアクティベーション用の設定ファイルが設置されている場合にenebular-agentが適切なタイミングでアクティベーションを行います。

## 設定方法

アクティベーション用の設定ファイルのパスがデフォルトで`.enebular-activation-config.json`になりますが、`ACTIVATOR_CONFIG_PATH`環境変数で違うパスを指定することができます。

設定ファイルは以下の例のように`enebularBaseURL`と`licenseKey`の値を含まないといけません。

```
{
	"enebularBaseURL": "https://enebular.com/api/v1",
	"licenseKey": "<KEY>"
}
```
