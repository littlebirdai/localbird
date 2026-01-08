const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

exports.default = async function(context) {
  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  const resourcesPath = path.join(appPath, 'Contents', 'Resources');
  const binPath = path.join(resourcesPath, 'bin');
  const entitlements = path.join(context.packager.projectDir, 'build', 'entitlements.mac.plist');

  // Sign bundled binaries with hardened runtime
  const binaries = ['localbird-service', 'qdrant-arm64', 'qdrant-x64'];

  for (const binary of binaries) {
    const binaryPath = path.join(binPath, binary);
    if (fs.existsSync(binaryPath)) {
      console.log(`[afterPack] Signing: ${binaryPath}`);
      try {
        execSync(`codesign --force --options runtime --sign - --entitlements "${entitlements}" "${binaryPath}"`, { stdio: 'inherit' });
      } catch (error) {
        console.error(`[afterPack] Failed to sign ${binary}:`, error.message);
      }
    }
  }

  // Strip extended attributes using find to hit EVERY file and directory
  // This is critical because codesign fails with "resource fork, Finder information, or similar detritus" errors
  console.log(`[afterPack] Stripping extended attributes from: ${appPath}`);

  try {
    // Use find to apply xattr -c to every single item
    // The -print0 and xargs -0 handle filenames with spaces correctly
    execSync(`find "${appPath}" -print0 | xargs -0 xattr -c 2>/dev/null || true`, { stdio: 'inherit', shell: '/bin/bash' });
    console.log('[afterPack] Extended attributes stripped from all files');
  } catch (error) {
    console.error('[afterPack] find/xattr failed:', error.message);
  }

  // Also explicitly remove specific problematic attrs that xattr -c might miss
  const problematicAttrs = [
    'com.apple.FinderInfo',
    'com.apple.fileprovider.fpfs#P',
    'com.apple.quarantine',
    'com.apple.provenance'
  ];

  for (const attr of problematicAttrs) {
    try {
      execSync(`find "${appPath}" -print0 | xargs -0 xattr -d "${attr}" 2>/dev/null || true`, { stdio: 'inherit', shell: '/bin/bash' });
    } catch (e) {
      // Expected to fail for items without this attr
    }
  }
  console.log('[afterPack] Problematic attributes explicitly removed');

  // Use dot_clean as final cleanup for ._ files
  try {
    execSync(`dot_clean -m "${appPath}"`, { stdio: 'inherit' });
    console.log('[afterPack] dot_clean completed');
  } catch (error) {
    console.error('[afterPack] dot_clean failed:', error.message);
  }
};
