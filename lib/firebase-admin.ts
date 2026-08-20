const APP_NAME = "heatman-push";

export function isFirebaseAdminConfigured() {
  return Boolean(
    process.env.FIREBASE_PROJECT_ID &&
      process.env.FIREBASE_CLIENT_EMAIL &&
      process.env.FIREBASE_PRIVATE_KEY,
  );
}

export async function getHeatManFirebaseMessaging() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error("Firebase Admin credentials are not configured.");
  }

  const [firebaseAdminApp, firebaseAdminMessaging] = await Promise.all([
    import("firebase-admin/app"),
    import("firebase-admin/messaging"),
  ]);

  const app =
    firebaseAdminApp.getApps().find((candidate) => candidate.name === APP_NAME) ??
    firebaseAdminApp.initializeApp(
      {
        credential: firebaseAdminApp.cert({
          projectId,
          clientEmail,
          privateKey: privateKey.replace(/\\n/g, "\n"),
        }),
      },
      APP_NAME,
    );

  return firebaseAdminMessaging.getMessaging(app);
}
