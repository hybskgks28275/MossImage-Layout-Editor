# MossImage Layout Editor

[English](README.md) | 日本語

Create Bounding Boxes (MossImage) のスタンドアローンElectron版です。ComfyUIを起動せずにレイアウトを編集し、MOSS-Imageの生成用プロンプトをJSONで出力できます。

ComfyUIのワークフロー内で同じレイアウトJSONを編集するには、[ComfyUI-MossImageTools](https://github.com/hybskgks28275/ComfyUI-MossImageTools/blob/main/README_ja.md)を使ってください。

![ポスターのサンプルレイアウト、選択中の領域、生成用JSONを表示したMossImage Layout Editorの画面](docs/images/layout-editor-ja.png)

## Windowsでのインストールと起動

1. [GitHub Releases](https://github.com/hybskgks28275/MossImage-Layout-Editor/releases)を開き、**Assets** から Windows x64 版のアプリアーカイブをダウンロードします。自動生成される **Source code** のアーカイブにはソースファイルだけが含まれます。
2. アーカイブ全体を任意のフォルダに展開します。
3. 展開先の `MossImage Layout Editor.exe` を起動します。実行ファイルと一緒に展開されたファイルは、同じフォルダにまとめて置いてください。

インストーラー不要のポータブル版です。

## レイアウトの編集とプロンプトの出力

1. 上部で生成画像の幅と高さを設定し、「＋ 描画」で領域を作ります。
2. 右側で画像全体の説明と、必要ならキャラクターとして扱う領域番号を入力します。
3. 「JSONをコピー」または「テキスト保存」で生成用プロンプトを取り出します。画面では読みやすく整形し、コピー・保存時は1行のJSONにします。

「レイアウトJSONを開く」と「レイアウトJSONを保存」は編集データ用です。アプリとComfyUIのカスタムノードの間で、version 1のレイアウトJSONを相互に読み込めます。ComfyUIで開く前に、キャンバスの幅と高さをアプリと同じ値に設定してください。アプリが保存した幅・高さ・全体説明・キャラクター番号は、ComfyUIでは対応するノードに入力します。幅と高さを含まない旧形式をアプリで開くと、現在の寸法を基準に、全領域が収まるよう必要に応じてキャンバスを広げます。元の生成サイズが分かる場合は、読み込み後に寸法を確認・調整してください。

## 開発

Node.js 24で確認しています。

```powershell
npm ci
npm start
npm test
npm run test:app
npm run package:win
```

Windows版は `dist/` に出力されます。GitHubで公開する際は、Windows版のビルドフォルダ全体をアーカイブにまとめ、リリースの添付ファイルとしてアップロードします。

`src/editor/` には ComfyUI-MossImageTools のエディターを同梱しています。[MITライセンス](LICENSE)が適用されます。
