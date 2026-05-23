import { notarize } from "@electron/notarize";

export default async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;
  if (electronPlatformName !== "darwin") return;

  const appName = context.packager.appInfo.productFilename;
  const appPath = `${appOutDir}/${appName}.app`;

  const { APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID } = process.env;
  if (!APPLE_ID || !APPLE_APP_SPECIFIC_PASSWORD || !APPLE_TEAM_ID) {
    console.warn(
      "[notarize] Skipping: APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, and APPLE_TEAM_ID must all be set."
    );
    return;
  }

  console.log(`[notarize] Notarizing ${appPath}…`);
  await notarize({
    appPath,
    appleId: APPLE_ID,
    appleIdPassword: APPLE_APP_SPECIFIC_PASSWORD,
    teamId: APPLE_TEAM_ID,
  });
  console.log("[notarize] Done.");
}
