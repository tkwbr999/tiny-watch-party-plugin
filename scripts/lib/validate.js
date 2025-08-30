const fs = require('fs');
const path = require('path');

function readJSON(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function validate() {
  const root = path.join(__dirname, '../..');
  const manifestPath = path.join(root, 'extension/manifest.json');
  const packagePath = path.join(root, 'package.json');

  console.log('Tiny Watch Party 検証を開始...');

  try {
    const manifest = readJSON(manifestPath);
    const pkg = readJSON(packagePath);

    console.log('基本情報:');
    console.log(`  名前: ${manifest.name}`);
    console.log(`  バージョン: ${manifest.version}`);
    console.log(`  説明: ${manifest.description}`);
    console.log(`  Manifest version: ${manifest.manifest_version}`);

    if (manifest.version !== pkg.version) {
      console.error('manifest.json と package.json のバージョンが不一致');
      console.error(`  manifest.json: ${manifest.version}`);
      console.error(`  package.json: ${pkg.version}`);
      process.exitCode = 1;
      return false;
    }
    console.log('バージョン整合性OK');

    for (const f of ['name', 'version', 'description', 'manifest_version']) {
      if (!manifest[f]) {
        console.error(`必須フィールドが不足: ${f}`);
        process.exitCode = 1;
        return false;
      }
    }
    console.log('必須フィールドOK');

    if (manifest.manifest_version !== 3) console.warn('Manifest V3を使用することを推奨します');
    else console.log('Manifest V3 対応');

    const files = ['extension/background.js', 'extension/content.js', 'extension/manifest.json'];
    console.log('ファイル存在チェック:');
    for (const rel of files) {
      const p = path.join(root, rel);
      if (!fs.existsSync(p)) {
        console.error(`必須ファイルが見つかりません: ${rel}`);
        process.exitCode = 1;
        return false;
      }
      const s = fs.statSync(p);
      console.log(`  ${rel} (${Math.round(s.size / 1024)}KB)`);
    }

    const total = files.reduce((n, rel) => n + fs.statSync(path.join(root, rel)).size, 0);
    console.log(`総ファイルサイズ: ${Math.round(total / 1024)}KB`);
    if (total > 50 * 1024 * 1024) console.warn('ファイルサイズが大きいです (Chrome Web Storeは50MB制限)');
    else console.log('ファイルサイズOK (Chrome Web Store制限内)');

    console.log('権限チェック:');
    if (manifest.permissions && manifest.permissions.length) {
      console.log(`  権限数: ${manifest.permissions.length}`);
      manifest.permissions.forEach((p) => console.log(`  - ${p}`));
      const unnecessary = ['tabs', 'activeTab', 'cookies', 'history', 'bookmarks'];
      const hasUnnecessary = manifest.permissions.some((p) => unnecessary.includes(p));
      if (hasUnnecessary) console.warn('  必要最小限の権限に留めることを推奨します');
      else console.log('  権限は適切です');
    } else {
      console.log('  権限: なし');
    }

    if (manifest.content_scripts) {
      console.log('Content Scripts:');
      manifest.content_scripts.forEach((s, i) => {
        console.log(`  スクリプト ${i + 1}:`);
        console.log(`    マッチパターン: ${s.matches?.join(', ') || 'なし'}`);
        console.log(`    JSファイル: ${s.js?.join(', ') || 'なし'}`);
        console.log(`    実行タイミング: ${s.run_at || 'document_idle'}`);
      });
    }

    console.log('すべての検証に合格しました');
    return true;
  } catch (e) {
    console.error('検証エラー:', e.message);
    process.exitCode = 1;
    return false;
  }
}

module.exports = { validate };
