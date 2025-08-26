const fs = require('fs');
const path = require('path');

console.log('🧪 Tiny Watch Party 拡張機能のテストを開始...\n');

function testContentScript() {
  const contentPath = path.join(__dirname, '../extension/content.js');
  const content = fs.readFileSync(contentPath, 'utf8');
  
  console.log('🔍 content.js のテスト:');
  
  // 重要な関数の存在チェック
  const requiredFunctions = [
    'sendMessage',
    'setupInputEventListeners',
    'createSidebar',
    'formatTime',
    'htmlEscape'
  ];
  
  console.log('   関数存在チェック:');
  for (const func of requiredFunctions) {
    if (content.includes(`function ${func}`) || content.includes(`${func} =`) || content.includes(`${func}(`)) {
      console.log(`     ✅ ${func}`);
    } else {
      console.error(`     ❌ ${func} 関数が見つかりません`);
      return false;
    }
  }
  
  // キーボードショートカット実装チェック
  console.log('\n   ⌨️  キーボードショートカットチェック:');
  const keyboardChecks = [
    { pattern: /metaKey.*ctrlKey.*shiftKey/, desc: 'クロスプラットフォーム対応' },
    { pattern: /addEventListener.*keydown/, desc: 'keydownイベントリスナー' },
    { pattern: /stopPropagation/, desc: 'イベント伝播停止' },
    { pattern: /preventDefault/, desc: 'デフォルト動作防止' },
    { pattern: /isComposing/, desc: '日本語入力考慮' }
  ];
  
  for (const check of keyboardChecks) {
    if (check.pattern.test(content)) {
      console.log(`     ✅ ${check.desc}`);
    } else {
      console.warn(`     ⚠️  ${check.desc} が見つかりません`);
    }
  }
  
  // セキュリティチェック
  console.log('\n   🔒 セキュリティチェック:');
  const securityChecks = [
    { pattern: /eval\s*\(/, message: 'eval()の使用', severity: 'error' },
    { pattern: /innerHTML\s*=\s*[^`]/, message: 'innerHTML直接代入', severity: 'warn' },
    { pattern: /document\.write/, message: 'document.write()の使用', severity: 'warn' },
    { pattern: /htmlEscape/, message: 'HTMLエスケープ処理', severity: 'good', invert: true }
  ];
  
  for (const check of securityChecks) {
    const found = check.pattern.test(content);
    const result = check.invert ? found : !found;
    
    if (check.severity === 'error' && !result) {
      console.error(`     ❌ ${check.message} が検出されました - 修正が必要`);
      return false;
    } else if (check.severity === 'warn' && !result) {
      console.warn(`     ⚠️  ${check.message} - 確認してください`);
    } else if (check.severity === 'good' && result) {
      console.log(`     ✅ ${check.message} 実装済み`);
    } else if (check.severity === 'good' && !result) {
      console.warn(`     ⚠️  ${check.message} が実装されていません`);
    } else {
      console.log(`     ✅ ${check.message} チェックOK`);
    }
  }
  
  return true;
}

function testBackgroundScript() {
  const backgroundPath = path.join(__dirname, '../extension/background.js');
  
  if (!fs.existsSync(backgroundPath)) {
    console.warn('⚠️  background.js が見つかりません');
    return true;
  }
  
  const background = fs.readFileSync(backgroundPath, 'utf8');
  
  console.log('\n🔧 background.js のテスト:');
  
  // Service Worker チェック
  const backgroundChecks = [
    { pattern: /chrome\.action\.onClicked/, desc: 'アクションクリックハンドラー' },
    { pattern: /chrome\.commands\.onCommand/, desc: 'コマンドハンドラー' },
    { pattern: /chrome\.runtime\.onMessage/, desc: 'メッセージハンドラー' }
  ];
  
  for (const check of backgroundChecks) {
    if (check.pattern.test(background)) {
      console.log(`   ✅ ${check.desc}`);
    } else {
      console.log(`   - ${check.desc} (未実装)`);
    }
  }
  
  return true;
}

function testManifestPermissions() {
  const manifestPath = path.join(__dirname, '../extension/manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  
  console.log('\n🔐 権限・設定テスト:');
  
  // 権限の妥当性チェック
  if (manifest.permissions) {
    console.log(`   権限数: ${manifest.permissions.length}`);
    manifest.permissions.forEach(permission => {
      console.log(`   - ${permission}`);
    });
    
    // 不要な権限のチェック
    const unnecessaryPermissions = ['tabs', 'activeTab', 'cookies', 'history'];
    const hasUnnecessary = manifest.permissions.some(p => unnecessaryPermissions.includes(p));
    
    if (hasUnnecessary) {
      console.warn('   ⚠️  不要な権限が含まれている可能性があります');
    } else {
      console.log('   ✅ 権限は最小限に抑えられています');
    }
  } else {
    console.log('   権限: なし (最適)');
  }
  
  // Content Scripts設定チェック
  if (manifest.content_scripts) {
    console.log('\n📜 Content Scripts設定:');
    manifest.content_scripts.forEach((script, index) => {
      console.log(`   スクリプト ${index + 1}:`);
      
      // 危険な設定のチェック
      if (script.matches && script.matches.includes('<all_urls>')) {
        console.warn('     ⚠️  <all_urls> は広範囲すぎる可能性があります');
      } else if (script.matches) {
        console.log(`     ✅ マッチパターン: ${script.matches.join(', ')}`);
      }
      
      if (script.run_at === 'document_start') {
        console.warn('     ⚠️  document_start は必要な場合のみ使用してください');
      } else {
        console.log(`     ✅ 実行タイミング: ${script.run_at || 'document_idle'}`);
      }
    });
  }
  
  // コマンド設定チェック
  if (manifest.commands) {
    console.log('\n⌨️  キーボードコマンド:');
    Object.entries(manifest.commands).forEach(([command, config]) => {
      console.log(`   ${command}:`);
      if (config.suggested_key) {
        Object.entries(config.suggested_key).forEach(([platform, key]) => {
          console.log(`     ${platform}: ${key}`);
        });
      }
      console.log(`     説明: ${config.description || 'なし'}`);
    });
  }
}

function testFileIntegrity() {
  console.log('\n📋 ファイル整合性テスト:');
  
  const requiredFiles = [
    'extension/manifest.json',
    'extension/background.js', 
    'extension/content.js'
  ];
  
  let totalSize = 0;
  
  for (const file of requiredFiles) {
    const filePath = path.join(__dirname, '..', file);
    
    if (!fs.existsSync(filePath)) {
      console.error(`   ❌ 必須ファイルが見つかりません: ${file}`);
      return false;
    }
    
    const stats = fs.statSync(filePath);
    totalSize += stats.size;
    
    // 空ファイルチェック
    if (stats.size === 0) {
      console.error(`   ❌ ファイルが空です: ${file}`);
      return false;
    }
    
    // 基本的な構文チェック
    if (file.endsWith('.json')) {
      try {
        JSON.parse(fs.readFileSync(filePath, 'utf8'));
        console.log(`   ✅ ${file} (${Math.round(stats.size/1024)}KB, JSON有効)`);
      } catch (e) {
        console.error(`   ❌ JSON構文エラー in ${file}: ${e.message}`);
        return false;
      }
    } else {
      console.log(`   ✅ ${file} (${Math.round(stats.size/1024)}KB)`);
    }
  }
  
  console.log(`   📊 総サイズ: ${Math.round(totalSize/1024)}KB`);
  
  if (totalSize > 20 * 1024 * 1024) { // 20MB警告
    console.warn('   ⚠️  ファイルサイズが大きいです');
  }
  
  return true;
}

function runTests() {
  try {
    let allTestsPassed = true;
    
    // 各テストを順次実行
    if (!testFileIntegrity()) {
      allTestsPassed = false;
    }
    
    if (!testContentScript()) {
      allTestsPassed = false;
    }
    
    if (!testBackgroundScript()) {
      allTestsPassed = false;
    }
    
    testManifestPermissions();
    
    if (allTestsPassed) {
      console.log('\n✅ すべてのテストに合格しました');
      console.log('🚀 拡張機能は配布準備完了です');
    } else {
      console.log('\n❌ 一部のテストが失敗しました');
      console.log('🔧 修正が必要な項目があります');
      process.exit(1);
    }
    
  } catch (error) {
    console.error('❌ テスト実行エラー:', error.message);
    process.exit(1);
  }
}

runTests();