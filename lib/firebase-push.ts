"use client";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const firebaseVapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;

export type HeatManPushRegistration = {
  installationId: string;
  stopForegroundMessages: () => void;
};

export function isFirebasePushConfigured() {
  return Boolean(
    firebaseConfig.apiKey &&
      firebaseConfig.authDomain &&
      firebaseConfig.projectId &&
      firebaseConfig.messagingSenderId &&
      firebaseConfig.appId &&
      firebaseVapidKey,
  );
}

export async function registerHeatManPush(): Promise<HeatManPushRegistration> {
  if (!isFirebasePushConfigured()) {
    throw new Error("Firebase browser configuration is incomplete.");
  }

  if (
    typeof window === "undefined" ||
    !("Notification" in window) ||
    !("serviceWorker" in navigator) ||
    !("PushManager" in window)
  ) {
    throw new Error("This browser does not support web push notifications.");
  }

  const [firebaseAppSdk, firebaseMessagingSdk] = await Promise.all([
    import("firebase/app"),
    import("firebase/messaging"),
  ]);

  if (!(await firebaseMessagingSdk.isSupported())) {
    throw new Error("Firebase messaging is not supported in this browser.");
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Notification permission was not granted.");
  }

  const app = firebaseAppSdk.getApps().length
    ? firebaseAppSdk.getApp()
    : firebaseAppSdk.initializeApp(firebaseConfig);
  const messaging = firebaseMessagingSdk.getMessaging(app);
  const serviceWorkerRegistration = await navigator.serviceWorker.register(
    firebaseServiceWorkerUrl(),
    { scope: "/" },
  );

  let resolveInstallation!: (installationId: string) => void;
  let rejectInstallation!: (error: unknown) => void;
  const installationPromise = new Promise<string>((resolve, reject) => {
    resolveInstallation = resolve;
    rejectInstallation = reject;
  });
  let settled = false;
  const timeout = window.setTimeout(() => {
    if (!settled) {
      settled = true;
      rejectInstallation(new Error("Firebase device registration timed out."));
    }
  }, 15_000);

  const stopRegistrationListener = firebaseMessagingSdk.onRegistered(messaging, (fid) => {
    if (settled) return;
    settled = true;
    window.clearTimeout(timeout);
    stopRegistrationListener();
    resolveInstallation(fid);
  });

  try {
    await firebaseMessagingSdk.register(messaging, {
      vapidKey: firebaseVapidKey,
      serviceWorkerRegistration,
    });
  } catch (error) {
    if (!settled) {
      settled = true;
      window.clearTimeout(timeout);
      stopRegistrationListener();
      rejectInstallation(error);
    }
  }

  const installationId = await installationPromise;

  const stopForegroundMessages = firebaseMessagingSdk.onMessage(messaging, (payload) => {
    const title =
      payload.data?.title ?? payload.notification?.title ?? "HeatMan safety alert";
    const body =
      payload.data?.body ??
      payload.notification?.body ??
      "A new heat-safety action needs your attention.";

    void serviceWorkerRegistration.showNotification(title, {
      body,
      icon: "/og.png",
      badge: "/og.png",
      tag: payload.data?.tag ?? "heatman-safety-alert",
      data: { url: payload.data?.url ?? "/" },
    });
  });

  return { installationId, stopForegroundMessages };
}

function firebaseServiceWorkerUrl() {
  const parameters = new URLSearchParams({
    apiKey: firebaseConfig.apiKey ?? "",
    authDomain: firebaseConfig.authDomain ?? "",
    projectId: firebaseConfig.projectId ?? "",
    messagingSenderId: firebaseConfig.messagingSenderId ?? "",
    appId: firebaseConfig.appId ?? "",
  });

  return `/firebase-messaging-sw.js?${parameters.toString()}`;
}

export function firebasePushErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);

  if (/permission|denied|blocked/i.test(message)) {
    return "Browser notifications are blocked. Allow notifications for HeatMan and try again.";
  }
  if (/not support|unsupported/i.test(message)) {
    return "This browser cannot receive Firebase web push notifications.";
  }
  if (/configuration|credential|project|vapid/i.test(message)) {
    return "Firebase push configuration is incomplete or invalid.";
  }
  if (/timed out/i.test(message)) {
    return "Firebase took too long to register this browser. Try again.";
  }

  return "HeatMan could not enable browser push notifications.";
}
