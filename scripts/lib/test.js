const fs = require('fs');
const path = require('path');

function read(p) {
  return fs.readFileSync(p, 'utf8');
}

function testContentScript() {
  const contentPath = path.join(__dirname, '../../extension/content.js');
  const content = read(contentPath);

  console.log('content.js のテスト:');

  const required = ['sendMessage', 'setupInputEventListeners', 'createSidebar', 'formatTime', 'htmlEscape'];
  console.log('  関数存在チェック:');
  for (const f of required) {
    if (content.includes(`function ${f}`) || content.includes(`${f} =`) || content.includes(`${f}(`)) {
      console.log(`    ${f}`);
    } else {
      console.error(`    ${f} 関数が見つかりません`);
      return false;
    }
  }

  console.log('  キーボードショートカットチェック:');
  const keyboard = [
    { pattern: /metaKey.*ctrlKey.*shiftKey/, desc: 'クロスプラットフォーム対応' },
    { pattern: /addEventListener.*keydown/, desc: 'keydownイベントリスナー' },
    { pattern: /stopPropagation/, desc: 'イベント伝播停止' },
    { pattern: /preventDefault/, desc: 'デフォルト動作防止' },
    { pattern: /isComposing/, desc: '日本語入力考慮' },
  ];
  for (const k of keyboard) {
    if (k.pattern.test(content)) console.log(`    ${k.desc}`);
    else console.warn(`    ${k.desc} が見つかりません`);
  }

  console.log('  セキュリティチェック:');
  const security = [
    { pattern: /eval\s*\(/, message: 'eval()の使用', severity: 'error' },
    { pattern: /innerHTML\s*=\s*[^`]/, message: 'innerHTML直接代入', severity: 'warn' },
    { pattern: /document\.write/, message: 'document.write()の使用', severity: 'warn' },
    { pattern: /htmlEscape/, message: 'HTMLエスケープ処理', severity: 'good', invert: true },
  ];
  for (const s of security) {
    const found = s.pattern.test(content);
    const ok = s.invert ? found : !found;
    if (s.severity === 'error' && !ok) {
      console.error(`    ${s.message} が検出されました - 修正が必要`);
      return false;
    } else if (s.severity === 'warn' && !ok) {
      console.warn(`    ${s.message} - 確認してください`);
    } else if (s.severity === 'good' && ok) {
      console.log(`    ${s.message} 実装済み`);
    } else if (s.severity === 'good' && !ok) {
      console.warn(`    ${s.message} が実装されていません`);
    } else {
      console.log(`    ${s.message} チェックOK`);
    }
  }

  return true;
}

function testBackgroundScript() {
  const backgroundPath = path.join(__dirname, '../../extension/background.js');
  if (!fs.existsSync(backgroundPath)) {
    console.warn('background.js が見つかりません');
    return true;
  }
  const background = read(backgroundPath);
  console.log('background.js のテスト:');
  const checks = [
    { pattern: /chrome\.action\.onClicked/, desc: 'アクションクリックハンドラー' },
    { pattern: /chrome\.commands\.onCommand/, desc: 'コマンドハンドラー' },
    { pattern: /chrome\.runtime\.onMessage/, desc: 'メッセージハンドラー' },
  ];
  for (const c of checks) console.log(c.pattern.test(background) ? `  ${c.desc}` : `  - ${c.desc} (未実装)`);
  return true;
}

function testManifestPermissions() {
  const manifestPath = path.join(__dirname, '../../extension/manifest.json');
  const manifest = JSON.parse(read(manifestPath));
  console.log('権限・設定テスト:');
  if (manifest.permissions) {
    console.log(`  権限数: ${manifest.permissions.length}`);
    manifest.permissions.forEach((p) => console.log(`  - ${p}`));
    const unnecessary = ['tabs', 'activeTab', 'cookies', 'history'];
    const hasUnnecessary = manifest.permissions.some((p) => unnecessary.includes(p));
    if (hasUnnecessary) console.warn('  不要な権限が含まれている可能性があります');
    else console.log('  権限は最小限に抑えられています');
  } else {
    console.log('  権限: なし (最適)');
  }
  if (manifest.content_scripts) {
    console.log('Content Scripts設定:');
    manifest.content_scripts.forEach((s, i) => {
      console.log(`  スクリプト ${i + 1}:`);
      if (s.matches && s.matches.includes('<all_urls>')) console.warn('    <all_urls> は広範囲すぎる可能性があります');
      else if (s.matches) console.log(`    マッチパターン: ${s.matches.join(', ')}`);
      if (s.run_at === 'document_start') console.warn('    document_start は必要な場合のみ使用してください');
      else console.log(`    実行タイミング: ${s.run_at || 'document_idle'}`);
    });
  }
}

function testFileIntegrity() {
  console.log('ファイル整合性テスト:');
  const root = path.join(__dirname, '../..');
  const required = ['extension/manifest.json', 'extension/background.js', 'extension/content.js'];
  let total = 0;
  for (const rel of required) {
    const p = path.join(root, rel);
    if (!fs.existsSync(p)) {
      console.error(`  必須ファイルが見つかりません: ${rel}`);
      return false;
    }
    const s = fs.statSync(p);
    total += s.size;
    if (s.size === 0) {
      console.error(`  ファイルが空です: ${rel}`);
      return false;
    }
    if (rel.endsWith('.json')) {
      try {
        JSON.parse(read(p));
        console.log(`  ${rel} (${Math.round(s.size / 1024)}KB, JSON有効)`);
      } catch (e) {
        console.error(`  JSON構文エラー in ${rel}: ${e.message}`);
        return false;
      }
    } else {
      console.log(`  ${rel} (${Math.round(s.size / 1024)}KB)`);
    }
  }
  console.log(`  総サイズ: ${Math.round(total / 1024)}KB`);
  if (total > 20 * 1024 * 1024) console.warn('  ファイルサイズが大きいです');
  return true;
}

function run() {
  console.log('Tiny Watch Party テストを開始...');
  try {
    let ok = true;
    if (!testFileIntegrity()) ok = false;
    if (!testContentScript()) ok = false;
    if (!testBackgroundScript()) ok = false;
    testManifestPermissions();
    if (ok) {
      console.log('すべてのテストに合格しました');
      console.log('拡張機能は配布準備完了です');
      return true;
    } else {
      console.log('一部のテストが失敗しました');
      console.log('修正が必要な項目があります');
      process.exitCode = 1;
      return false;
    }
  } catch (e) {
    console.error('テスト実行エラー:', e.message);
    process.exitCode = 1;
    return false;
  }
}

module.exports = { run, testContentScript, testBackgroundScript, testManifestPermissions, testFileIntegrity };
