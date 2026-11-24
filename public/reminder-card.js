import { request } from "./api.js";
import { byId } from "./dom.js";
import { showToast } from "./toast.js";

export function createReminderCard({ onError }) {
  let registration = null;
  let info = null;

  async function setUp() {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      show("unsupported");
      return;
    }
    registration = await navigator.serviceWorker.register("sw.js");
    info = await request("GET", "/api/reminders");
    await refresh();
  }

  async function refresh() {
    if (Notification.permission === "denied") {
      show("blocked");
      return;
    }
    const subscription = await currentSubscription();
    if (subscription) {
      await request("POST", "/api/reminders/subscribe", { endpoint: subscription.endpoint });
    }
    show(subscription ? "on" : "off");
  }

  async function currentSubscription() {
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription || sameKey(subscription.options.applicationServerKey, info.publicKey)) {
      return subscription;
    }
    await subscription.unsubscribe();
    return null;
  }

  async function turnOn() {
    if ((await Notification.requestPermission()) !== "granted") {
      await refresh();
      return;
    }
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToBytes(info.publicKey),
    });
    await request("POST", "/api/reminders/subscribe", { endpoint: subscription.endpoint });
    show("on");
    showToast("Reminders are on.");
  }

  async function turnOff() {
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      await request("POST", "/api/reminders/unsubscribe", { endpoint: subscription.endpoint });
      await subscription.unsubscribe();
    }
    show("off");
    showToast("Reminders are off.");
  }

  async function sendTest() {
    await request("POST", "/api/reminders/test");
    showToast("Sent. It should show up in a few seconds.");
  }

  function show(mode) {
    byId("reminder-status").textContent = statusText(mode, info?.hour);
    byId("reminder-on").hidden = mode !== "off";
    byId("reminder-test").hidden = mode !== "on";
    byId("reminder-off").hidden = mode !== "on";
  }

  function safely(handler) {
    return () => handler().catch(onError);
  }

  byId("reminder-on").addEventListener("click", safely(turnOn));
  byId("reminder-off").addEventListener("click", safely(turnOff));
  byId("reminder-test").addEventListener("click", safely(sendTest));

  return { setUp };
}

function statusText(mode, hour) {
  const time = hour === undefined ? "" : hourLabel(hour);
  const texts = {
    on: `On. If you haven't checked in by ${time}, this phone gets a notification.`,
    off: `Get a notification at ${time} on days you haven't checked in.`,
    blocked:
      "Notifications are blocked for this site. Allow them in the browser's site settings, then reload.",
    unsupported: "This browser can't show notifications. Open the site in Chrome.",
  };
  return texts[mode];
}

function hourLabel(hour) {
  return new Date(2000, 0, 1, hour).toLocaleTimeString(undefined, { hour: "numeric" });
}

function sameKey(buffer, base64) {
  return buffer !== null && bytesToBase64Url(new Uint8Array(buffer)) === base64;
}

function bytesToBase64Url(bytes) {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

function base64UrlToBytes(text) {
  const binary = atob(text.replaceAll("-", "+").replaceAll("_", "/"));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
