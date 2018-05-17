
# enebular-agent - Enebular Activator

*Read this in other languages: [English](README-enebular-activator.md), [日本語](README-enebular-activator.ja.md)*

enebular-activatorモジュールはenebularに対するアクティベーションに対応するために利用します。

## 利用方法

enebular-activatorモジュールを有効にするには、以下の例のようにenebular-agentを実行する時に`ACTIVATOR`環境変数に`enebular`を指定します。

```
ACTIVATOR=enebular npm run start
```

## 設定方法

enebular-activatorモジュールは設定ファイルを必要としています。設定ファイルのパスはデフォルトで`.enebular-activation-config.json`になりますが、`ACTIVATOR_CONFIG_PATH`環境変数で違うパスを指定することができます。

設定ファイルは以下の例のように`enebularBaseURL`と`licenseKey`の値を含まないといけません。

```
{
	"enebularBaseURL": "https://enebular.com/api/v1",
	"licenseKey": "<KEY>"
}
```
