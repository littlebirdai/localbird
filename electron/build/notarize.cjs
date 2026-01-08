const { notarize } = require('@electron/notarize');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', 'electron-builder.env') });

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;

  if (electronPlatformName !== 'darwin') {
    return;
  }

  // Allow skipping notarization via environment variable
  if (process.env.SKIP_NOTARIZE === '1' || process.env.SKIP_NOTARIZE === 'true') {
    console.log('[notarize] Skipping notarization (SKIP_NOTARIZE is set)');
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = `${appOutDir}/${appName}.app`;

  console.log(`[notarize] Starting notarization for: ${appPath}`);

  if (!process.env.APPLE_ID || !process.env.APPLE_ID_PASSWORD || !process.env.APPLE_TEAM_ID) {
    console.log('[notarize] Missing notarization credentials, skipping...');
    console.log('[notarize] Set APPLE_ID, APPLE_ID_PASSWORD, and APPLE_TEAM_ID in electron-builder.env');
    return;
  }

  try {
    await notarize({
      appPath,
      appleId: process.env.APPLE_ID,
      appleIdPassword: process.env.APPLE_ID_PASSWORD,
      teamId: process.env.APPLE_TEAM_ID
    });
    console.log('[notarize] Notarization complete!');
  } catch (error) {
    console.error('[notarize] Notarization failed:', error);
    throw error;
  }
};
