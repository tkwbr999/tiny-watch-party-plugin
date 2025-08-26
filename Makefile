.PHONY: help clean dist pack release test install validate dev-pack

VERSION = $(shell node -p "require('./package.json').version")
PACKAGE_NAME = tiny-watch-party-v$(VERSION)
STORE_PACKAGE = tiny-watch-party-store

help:
	@echo "🚀 Tiny Watch Party - ビルドシステム"
	@echo ""
	@echo "配布用コマンド:"
	@echo "  make pack         - 配布用ZIPファイルを作成"
	@echo "  make dev-pack     - 開発用（未圧縮）パッケージを作成"
	@echo "  make store        - Chrome Web Store用パッケージを作成"
	@echo "  make all-packs    - 全パッケージタイプを同時作成"
	@echo "  make release      - バージョンアップ→ビルド→Git操作"
	@echo ""
	@echo "開発用コマンド:"
	@echo "  make validate     - 拡張機能の検証"
	@echo "  make test         - 拡張機能のテスト実行"
	@echo "  make clean        - ビルド成果物を削除"
	@echo ""
	@echo "現在のバージョン: $(VERSION)"

clean:
	@echo "🧹 ビルド成果物を削除中..."
	rm -rf dist/
	rm -rf releases/
	rm -f *.zip
	find . -name ".DS_Store" -delete 2>/dev/null || true
	@echo "✅ クリーンアップ完了"

validate:
	@echo "📋 拡張機能の検証中..."
	@node scripts/validate.js
	@echo "✅ 検証完了"

dist: clean validate
	@echo "🏗️  配布用ディレクトリを準備中..."
	mkdir -p dist/extension
	mkdir -p releases
	
	# 必要なファイルのみコピー
	cp extension/manifest.json dist/extension/
	cp extension/background.js dist/extension/
	cp extension/content.js dist/extension/
	
	# 不要なファイルを除外
	find dist -name ".DS_Store" -delete 2>/dev/null || true
	find dist -name "*.log" -delete 2>/dev/null || true
	find dist -name "Thumbs.db" -delete 2>/dev/null || true
	find dist -name "*.map" -delete 2>/dev/null || true
	
	@echo "✅ 配布用ディレクトリ準備完了"

pack: dist
	@echo "📦 ZIPパッケージを作成中..."
	cd dist && zip -qr9X "../releases/$(PACKAGE_NAME).zip" extension/
	@echo "✅ パッケージ作成完了: releases/$(PACKAGE_NAME).zip"
	@echo "📊 ファイルサイズ: $$(du -h releases/$(PACKAGE_NAME).zip | cut -f1)"
	@ls -la releases/$(PACKAGE_NAME).zip

dev-pack: dist
	@echo "🛠️  開発用パッケージを作成中..."
	cp -r dist/extension releases/$(PACKAGE_NAME)-dev/
	@echo "✅ 開発用パッケージ: releases/$(PACKAGE_NAME)-dev/"
	@echo "Chrome拡張機能ページで「パッケージ化されていない拡張機能を読み込む」を使用してください"

store: dist
	@echo "🏪 Chrome Web Store用パッケージを作成中..."
	cd dist && zip -qr9X "../releases/$(STORE_PACKAGE).zip" extension/ \
		-x "*.DS_Store" -x "*Thumbs.db" -x "*.log" -x "*test*" -x "*.md"
	@echo "✅ Store用パッケージ: releases/$(STORE_PACKAGE).zip"
	@echo "📊 ファイルサイズ: $$(du -h releases/$(STORE_PACKAGE).zip | cut -f1)"

all-packs: dist
	@echo "📦 全パッケージタイプを作成中..."
	
	# 配布用ZIPパッケージ
	@echo "  📦 配布用ZIPパッケージ..."
	cd dist && zip -qr9X "../releases/$(PACKAGE_NAME).zip" extension/
	
	# Chrome Web Store用パッケージ
	@echo "  🏪 Chrome Web Store用パッケージ..."
	cd dist && zip -qr9X "../releases/$(STORE_PACKAGE).zip" extension/ \
		-x "*.DS_Store" -x "*Thumbs.db" -x "*.log" -x "*test*" -x "*.md"
	
	# 開発用（未圧縮）パッケージ
	@echo "  🛠️  開発用パッケージ..."
	cp -r dist/extension releases/$(PACKAGE_NAME)-dev/
	
	@echo ""
	@echo "✅ 全パッケージ作成完了:"
	@echo "  📦 配布用: releases/$(PACKAGE_NAME).zip"
	@echo "  🏪 Store用: releases/$(STORE_PACKAGE).zip" 
	@echo "  🛠️  開発用: releases/$(PACKAGE_NAME)-dev/"
	@echo ""
	@echo "📊 ファイルサイズ:"
	@ls -lah releases/ | grep -v "^total" | grep -v "^drwx"

test: validate
	@echo "🧪 拡張機能のテスト実行中..."
	@node scripts/test.js
	@echo "✅ テスト完了"

release: test
	@echo "🚀 リリースプロセスを開始..."
	npm run release:patch
	$(MAKE) pack
	npm run push
	@echo "🎉 バージョン v$$(node -p "require('./package.json').version") をリリースしました"

install:
	@echo "📥 依存関係をインストール中..."
	npm install
	@echo "✅ インストール完了"