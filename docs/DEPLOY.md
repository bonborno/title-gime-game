# GitHub Pagesで公開する

この `docs` フォルダーは、Pythonサーバーなしで動く公開用アプリです。
GitHubにはフォルダーごとアップロードしてください。

1. `https://github.com/bonborno/title-gime-game` を開く。
2. 「Add file」→「Upload files」で、この `docs` フォルダーをドラッグする。
3. 「Commit changes」を押す。
4. GitHubで `docs/index.html` があることを確認する。
5. 「Settings」→「Pages」を開く。
6. Sourceを「Deploy from a branch」、Branchを「main」、フォルダーを「/docs」にして「Save」。
7. 「Actions」でPagesの公開処理に緑のチェックが付くのを待つ。
8. `https://bonborno.github.io/title-gime-game/` を開いて遊べることを確認する。

確認後、このURLを提出フォームの「デプロイ済みのアプリURL」に貼ります。
これは公開設定後のURLです。ファイルの用意だけでは公開されません。

## 山札や画面を更新する

ルートの山札JSONや `web` の画面を編集した後は、`python build_pages.py` で `docs` を更新してください。
その後、GitHub上の `docs` を更新すると再公開されます。
ブラウザー内のゲーム処理は `docs/game.js` にあります。

## ローカルで確認する

プロジェクトのフォルダーで `python -m http.server 8000 --bind 127.0.0.1 --directory docs` を実行し、
ブラウザーで `http://127.0.0.1:8000/` を開きます。ファイルのダブルクリックでは山札を読み込めません。

1台・同じタブで交代して遊びます。各タブの進行はブラウザー内で保存します。
ページ更新では提出済みの進行を復元しますが、未提出のカード選択は消えます。
タブを閉じると進行はリセットされます。サーバーやオンライン対戦機能はありません。
