# Enebular Runtime Agent (for device and more) #

Enebular Agent プログラム （MODEデモ含む）

エージェントプログラムを挟んでNode-REDインスタンスのフロー定義を更新したりする

AWS-IoTデプロイの後継として活用を想定

### 構成

```
├── agent # エージェントプログラムのライブラリ (フロー情報のダウンロード、書き換え、Node−REDの起動／停止)
├── node-red # エージェントによって起動されるNode-REDのインスタンス
│   └── .node-red-config
│       ├── enebular-agent-dynamic-deps
│       │　   └── package.json  # 依存モジュールを定義したpackage.json(エージェントの書き換え対象)
│   　　   ├── flows.json      # フローの定義ファイル(エージェントの書き換え対象)
│       └── flows_cred.json # フローのクレデンシャルファイル(エージェントの書き換え対象)
├── ports       # 各プラットフォームごとのエージェント／コマンド実装
│   ├── awsiot    # AWSIoTを利用したデバイスの接続
│   │   ├── README.md
│   │   ├── agent # AWSIoTに接続するデバイスエージェントプログラム。AWSIoTにThingとして接続しShadowの更新通知を受ける。
│   │   └── command # AWSIoTに接続するコマンドクライアントプログラム。AWS SDKでThingにフロー情報の更新などを行う
│   └── modeinc    # MODEサービスへの接続
│       ├── README.md
│       ├── agent # MODEサービスに接続するデバイスエージェントプログラム。MODEにデバイスとして接続し通知を監視する。
│       └── command # MODEサービスに接続するコマンドクライアントプログラム。MODE REST APIでデバイスにフロー更新等の通知を行う
└── store # フロー情報etcをパッケージしてS3に格納して署名URLを発行するライブラリ
```