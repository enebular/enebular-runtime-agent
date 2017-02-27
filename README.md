# Enebular Agent (for device and more) #

Enebular Agent プログラム （Modeincデモ含む）

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
│   └── modeinc    # MODEサービスへの接続
│       ├── README.md
│       ├── agent # MODEサービスに接続するデバイスエージェントプログラム
│       └── command # MODEサービスに接続するコマンドクライアントプログラム
└── store # フロー情報etcをパッケージしてS3に格納して署名URLを発行するライブラリ
```