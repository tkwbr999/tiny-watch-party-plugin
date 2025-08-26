const fs = require('fs');
const path = require('path');

console.log('📋 Tiny Watch Party 拡張機能の検証を開始...\n');

function validateManifest() {
  const manifestPath = path.join(__dirname, '../extension/manifest.json');
  const packagePath = path.join(__dirname, '../package.json');
  
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    
    console.log('📄 基本情報:');
    console.log(`   名前: ${manifest.name}`);
    console.log(`   バージョン: ${manifest.version}`);
    console.log(`   説明: ${manifest.description}`);
    console.log(`   Manifest version: ${manifest.manifest_version}`);
    
    // バージョン一致チェック
    if (manifest.version !== packageJson.version) {
      console.error('❌ manifest.json と package.json のバージョンが不一致');
      console.error(`   manifest.json: ${manifest.version}`);
      console.error(`   package.json: ${packageJson.version}`);
      process.exit(1);
    }
    console.log('✅ バージョン整合性OK');
    
    // 必須フィールドチェック
    const requiredFields = ['name', 'version', 'description', 'manifest_version'];
    for (const field of requiredFields) {
      if (!manifest[field]) {
        console.error(`❌ 必須フィールドが不足: ${field}`);
        process.exit(1);
      }
    }
    console.log('✅ 必須フィールドOK');
    
    // Manifest V3 チェック
    if (manifest.manifest_version !== 3) {
      console.warn('⚠️  Manifest V3を使用することを推奨します');
    } else {
      console.log('✅ Manifest V3 対応');
    }
    
    // 必須ファイルチェック
    const requiredFiles = [
      'extension/background.js',
      'extension/content.js',
      'extension/manifest.json'
    ];
    
    console.log('\n📁 ファイル存在チェック:');
    for (const file of requiredFiles) {
      const filePath = path.join(__dirname, '..', file);
      if (!fs.existsSync(filePath)) {
        console.error(`❌ 必須ファイルが見つかりません: ${file}`);
        process.exit(1);
      }
      const stats = fs.statSync(filePath);
      console.log(`   ✅ ${file} (${Math.round(stats.size/1024)}KB)`);
    }
    
    // ファイルサイズチェック
    const totalSize = requiredFiles.reduce((sum, file) => {
      const filePath = path.join(__dirname, '..', file);
      return sum + fs.statSync(filePath).size;
    }, 0);
    
    console.log(`\n📊 総ファイルサイズ: ${Math.round(totalSize/1024)}KB`);
    
    if (totalSize > 50 * 1024 * 1024) { // 50MB制限
      console.warn('⚠️  ファイルサイズが大きいです (Chrome Web Storeは50MB制限)');
    } else {
      console.log('✅ ファイルサイズOK (Chrome Web Store制限内)');
    }
    
    // 権限チェック
    console.log('\n🔐 権限チェック:');
    if (manifest.permissions && manifest.permissions.length > 0) {
      console.log(`   権限数: ${manifest.permissions.length}`);
      manifest.permissions.forEach(permission => {
        console.log(`   - ${permission}`);
      });
      
      // 不要な権限の警告
      const potentiallyUnnecessary = ['tabs', 'activeTab', 'cookies', 'history', 'bookmarks'];
      const hasUnnecessary = manifest.permissions.some(p => potentiallyUnnecessary.includes(p));
      
      if (hasUnnecessary) {
        console.warn('   ⚠️  必要最小限の権限に留めることを推奨します');
      } else {
        console.log('   ✅ 権限は適切です');
      }
    } else {
      console.log('   権限: なし（理想的）');
    }
    
    // content_scripts チェック
    if (manifest.content_scripts) {
      console.log('\n📜 Content Scripts:');
      manifest.content_scripts.forEach((script, index) => {
        console.log(`   スクリプト ${index + 1}:`);
        console.log(`     マッチパターン: ${script.matches?.join(', ') || 'なし'}`);
        console.log(`     JSファイル: ${script.js?.join(', ') || 'なし'}`);
        console.log(`     実行タイミング: ${script.run_at || 'document_idle'}`);
      });
    }
    
    console.log('\n✅ すべての検証に合格しました');
    
  } catch (error) {
    console.error('❌ 検証エラー:', error.message);
    process.exit(1);
  }
}

validateManifest();