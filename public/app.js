import { LoggedOut, request } from "./api.js";
import { byId } from "./dom.js";
import { createHome } from "./home.js";
import { createReminderCard } from "./reminder-card.js";
import { ROUTINES } from "./routines.js";
import { unlockSound } from "./sound.js";
import { createStretchScreen } from "./stretch-screen.js";
import { createTimesPage } from "./times-page.js";
import { showToast } from "./toast.js";

const VIEWS = ["login", "home", "session", "finished", "times"];
const ROUTINE_HASH_PREFIX = "#stretch-";

let times = {};

const home = createHome({ getTimes: () => times, onError: reportError });
const reminderCard = createReminderCard({ onError: reportError });
const stretchScreen = createStretchScreen({
  onFinished: (routineId) => finishRoutine(routineId).catch(reportError),
  onQuit: () => goTo(""),
});
const timesPage = createTimesPage({
  getTimes: () => times,
  onSaved: saveTimes,
  onError: reportError,
});

function showView(name) {
  for (const view of VIEWS) {
    byId(view).hidden = view !== name;
  }
}

function reportError(error) {
  if (error instanceof LoggedOut) {
    showView("login");
    return;
  }
  console.error(error);
  showToast(error.message);
}

async function loadAccount() {
  const me = await request("GET", "/api/me");
  byId("account-name").textContent = me.username;
  times = await request("GET", "/api/times");
  await home.load();
  reminderCard.setUp().catch(reportError);
}

async function finishRoutine(routineId) {
  await home.checkInToday(routineId);
  byId("finished-text").textContent =
    `${ROUTINES[routineId].name} stretch done. You're checked in for today.`;
  goTo("#finished");
}

function saveTimes(saved) {
  times = saved;
  goTo("");
}

async function logIn(event) {
  event.preventDefault();
  byId("login-error").textContent = "";
  try {
    await request("POST", "/api/login", {
      username: byId("username").value.trim(),
      password: byId("password").value,
    });
    byId("password").value = "";
    await loadAccount();
    route();
  } catch (error) {
    byId("login-error").textContent = error.message;
  }
}

async function logOut() {
  await request("POST", "/api/logout");
  stretchScreen.stop();
  showView("login");
}

function routineInHash(hash) {
  const routineId = hash.startsWith(ROUTINE_HASH_PREFIX)
    ? hash.slice(ROUTINE_HASH_PREFIX.length)
    : null;
  return Object.hasOwn(ROUTINES, routineId ?? "") ? routineId : null;
}

function route() {
  const routineId = routineInHash(location.hash);
  if (routineId) {
    stretchScreen.start(routineId, times);
    showView("session");
    return;
  }
  stretchScreen.stop();
  if (location.hash === "#finished") {
    showView("finished");
  } else if (location.hash === "#times") {
    timesPage.render();
    showView("times");
  } else {
    home.render();
    showView("home");
  }
}

function goTo(hash) {
  history.replaceState(null, "", hash || location.pathname);
  route();
}

function refreshWhenShown() {
  if (document.visibilityState !== "visible") {
    return;
  }
  stretchScreen.keepScreenOnAgain();
  if (!byId("home").hidden) {
    home
      .load()
      .then(() => home.render())
      .catch(reportError);
  }
}

async function start() {
  document.addEventListener("pointerdown", unlockSound);
  window.addEventListener("hashchange", route);
  document.addEventListener("visibilitychange", refreshWhenShown);
  byId("login-form").addEventListener("submit", logIn);
  byId("log-out").addEventListener("click", () => logOut().catch(reportError));
  try {
    await loadAccount();
    route();
  } catch (error) {
    reportError(error);
  }
}

start();
