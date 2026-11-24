import { countCheckIns, dayStatus, isoDate, monthGrid } from "./calendar.js";
import { DEFAULT_SECONDS, ROUTINES, buildSteps, routineSeconds } from "./routines.js";
import { startSession, updateSession, viewSession } from "./session.js";

const VIEWS = ["login", "home", "session", "finished", "times"];
const TICK_MS = 200;
const ACTIVITY_NAMES = { lift: "lift", lower: "lower body stretch", upper: "upper body stretch" };
const REMINDER_TEXT = {
  on: "On. If you haven't checked in by 10 PM, this phone gets a notification.",
  off: "Get a notification at 10 PM on days you haven't checked in.",
  blocked: "Notifications are blocked for this site. Allow them in the browser's site settings, then reload.",
  unsupported: "This browser can't show notifications. Open the site in Chrome.",
};

const state = {
  checkIns: {},
  first: null,
  times: {},
  month: currentMonth(),
  routineId: null,
  session: null,
  timer: null,
  wakeLock: null,
  registration: null,
  dayOpen: null,
  pausedBeforeEnd: false,
};

let audio = null;

class LoggedOut extends Error {}

function $(id) {
  return document.getElementById(id);
}

async function request(method, path, body) {
  const options = body === undefined ? { method } : { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
  const response = await fetch(path, options);
  const data = await response.json().catch(() => ({}));
  if (response.status === 401 && path !== "/api/login") throw new LoggedOut();
  if (!response.ok) throw new Error(data.error ?? `Something went wrong (HTTP ${response.status}).`);
  return data;
}

function showView(name) {
  for (const view of VIEWS) $(view).hidden = view !== name;
}

function toast(message) {
  const box = $("toast");
  box.textContent = message;
  box.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => box.classList.remove("show"), 2500);
}

function reportError(error) {
  if (error instanceof LoggedOut) return showView("login");
  console.error(error);
  toast(error.message);
}

function todayDate() {
  return isoDate(new Date());
}

function currentMonth() {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() };
}

function longDate(date) {
  return new Date(date + "T12:00:00").toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}

function joinWords(words) {
  if (words.length < 2) return words.join("");
  return `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`;
}

function describeActivities(activities) {
  if (!activities.length) return "Not checked in yet.";
  const text = joinWords(activities.map((a) => ACTIVITY_NAMES[a]));
  return `Checked in: ${text[0].toUpperCase()}${text.slice(1)}.`;
}

function activitiesOn(date) {
  return state.checkIns[date] ?? [];
}

function monthRange() {
  const days = monthGrid(state.month.year, state.month.month).flat();
  const today = todayDate();
  const from = days[0].date < today ? days[0].date : today;
  const to = days.at(-1).date > today ? days.at(-1).date : today;
  return { from, to };
}

async function loadMonth() {
  const { from, to } = monthRange();
  const data = await request("GET", `/api/checkins?from=${from}&to=${to}`);
  const outside = Object.entries(state.checkIns).filter(([date]) => date < from || date > to);
  state.checkIns = { ...Object.fromEntries(outside), ...data.checkIns };
  state.first = data.first;
}

async function loadEverything() {
  state.times = await request("GET", "/api/times");
  await loadMonth();
  setUpReminders().catch(reportError);
}

async function saveActivities(date, activities) {
  await request("PUT", `/api/checkins/${date}`, { activities });
  await loadMonth();
  renderHome();
}

async function addActivity(date, activity) {
  const current = activitiesOn(date);
  if (!current.includes(activity)) await saveActivities(date, [...current, activity]);
}

async function toggleLift() {
  const today = todayDate();
  const current = activitiesOn(today);
  const lifted = current.includes("lift");
  await saveActivities(today, lifted ? current.filter((a) => a !== "lift") : [...current, "lift"]);
  toast(lifted ? "Removed today's lift." : "Checked in: lift.");
}

function renderHome() {
  renderToday();
  renderCalendar();
  renderRoutineLengths();
}

function renderToday() {
  const activities = activitiesOn(todayDate());
  $("today-label").textContent = longDate(todayDate());
  $("today-status").textContent = describeActivities(activities);
  $("lift").setAttribute("aria-pressed", String(activities.includes("lift")));
  $("stretch").classList.toggle("done", activities.includes("lower") || activities.includes("upper"));
}

function renderRoutineLengths() {
  for (const id of Object.keys(ROUTINES)) {
    const minutes = Math.round(routineSeconds(id, state.times) / 60);
    document.querySelector(`[data-length="${id}"]`).textContent = `about ${minutes} min`;
  }
}

function toggleRoutines() {
  const open = $("routines").hidden;
  $("routines").hidden = !open;
  $("stretch").setAttribute("aria-expanded", String(open));
}

function renderCalendar() {
  const { year, month } = state.month;
  $("month-label").textContent = new Date(year, month, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const today = todayDate();
  const cells = monthGrid(year, month).flat().map((cell) => dayButton(cell, today));
  $("calendar").replaceChildren(...cells);
  $("month-count").textContent = monthCountText(countCheckIns(state.checkIns, year, month));
}

function monthCountText(count) {
  return count === 1 ? "Checked in 1 day this month." : `Checked in ${count} days this month.`;
}

function dayButton(cell, today) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `day ${dayStatus(cell.date, today, state.checkIns, state.first)}`;
  button.classList.toggle("outside", !cell.inMonth);
  button.classList.toggle("today", cell.date === today);
  button.textContent = String(cell.day);
  button.disabled = cell.date > today;
  button.setAttribute("aria-label", `${longDate(cell.date)}. ${describeActivities(activitiesOn(cell.date))}`);
  button.addEventListener("click", () => openDay(cell.date));
  return button;
}

async function moveMonth(by) {
  const date = new Date(state.month.year, state.month.month + by, 1);
  state.month = { year: date.getFullYear(), month: date.getMonth() };
  renderCalendar();
  await loadMonth();
  renderCalendar();
}

function openDay(date) {
  state.dayOpen = date;
  $("day-title").textContent = longDate(date);
  const activities = activitiesOn(date);
  for (const box of $("day-form").elements.activity) box.checked = activities.includes(box.value);
  openDialog("day-dialog");
}

async function closeDay() {
  if ($("day-dialog").returnValue !== "save") return;
  const checked = [...$("day-form").elements.activity].filter((box) => box.checked).map((box) => box.value);
  await saveActivities(state.dayOpen, checked);
  toast("Saved.");
}

function beginRoutine(routineId) {
  if (state.session && state.routineId === routineId) return;
  stopSession();
  state.routineId = routineId;
  state.session = startSession(buildSteps(routineId, state.times), Date.now());
  state.timer = setInterval(() => applySession("tick"), TICK_MS);
  keepScreenOn();
  renderSession(viewSession(state.session, Date.now()));
}

function stopSession() {
  clearInterval(state.timer);
  state.timer = null;
  state.session = null;
  state.wakeLock?.release().catch(() => {});
  state.wakeLock = null;
}

function applySession(action) {
  if (!state.session) return;
  const now = Date.now();
  const before = viewSession(state.session, now);
  state.session = updateSession(state.session, action, now);
  const after = viewSession(state.session, now);
  if (action === "tick") signalChange(before, after);
  if (after.phase === "done") return finishRoutine(true).catch(reportError);
  renderSession(after);
}

function signalChange(before, after) {
  if (after.phase === "done") return chime(3);
  if (before.number !== after.number) return chime(2);
  if (before.phase !== after.phase) return goTone();
  if (after.secondsLeft !== before.secondsLeft && after.secondsLeft > 0 && after.secondsLeft <= 3) tickTone();
}

function renderSession(view) {
  $("session-progress").textContent = `${view.number} of ${view.count}`;
  $("session-phase").textContent = phaseText(view);
  $("session-name").textContent = view.step.name;
  $("session-side").textContent = view.step.side ?? "";
  $("session-clock").textContent = clockText(view.secondsLeft);
  $("session-pause").textContent = view.paused ? "Resume" : "Pause";
  $("session").dataset.phase = view.paused ? "paused" : view.phase;
  $("session-next").textContent = nextText(view.number);
  renderCues(view.step);
}

function phaseText(view) {
  if (view.paused) return "Paused";
  return view.phase === "ready" ? "Get ready" : "Hold";
}

function clockText(seconds) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function nextText(number) {
  const next = state.session.steps[number];
  if (!next) return "Last one";
  return next.side ? `Next: ${next.name}, ${next.side.toLowerCase()}` : `Next: ${next.name}`;
}

function renderCues(step) {
  if ($("session-cues").dataset.stretch === step.id) return;
  $("session-cues").dataset.stretch = step.id;
  $("session-cues").replaceChildren(...step.cues.map(cueItem));
}

function cueItem(cue) {
  const item = document.createElement("li");
  item.textContent = cue;
  return item;
}

function togglePause() {
  applySession(viewSession(state.session, Date.now()).paused ? "resume" : "pause");
}

function askToEnd() {
  state.pausedBeforeEnd = viewSession(state.session, Date.now()).paused;
  applySession("pause");
  openDialog("end-dialog");
}

function openDialog(id) {
  $(id).returnValue = "";
  $(id).showModal();
}

function closeEnd() {
  const choice = $("end-dialog").returnValue;
  if (choice === "check-in") return finishRoutine(true).catch(reportError);
  if (choice === "quit") return finishRoutine(false).catch(reportError);
  if (!state.pausedBeforeEnd) applySession("resume");
}

async function finishRoutine(checkIn) {
  const routineId = state.routineId;
  stopSession();
  if (!checkIn) return goTo("");
  await addActivity(todayDate(), routineId);
  $("finished-text").textContent = `${ROUTINES[routineId].name} stretch done. You're checked in for today.`;
  goTo("#finished");
}

function goTo(hash) {
  history.replaceState(null, "", hash || location.pathname);
  route();
}

async function keepScreenOn() {
  try {
    state.wakeLock = (await navigator.wakeLock?.request("screen")) ?? null;
  } catch {
    state.wakeLock = null;
  }
}

function unlockAudio() {
  audio ??= new AudioContext();
  if (audio.state === "suspended") audio.resume();
}

function beep(frequency, startSeconds, lengthSeconds) {
  if (!audio) return;
  const start = audio.currentTime + startSeconds;
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0.25, start);
  gain.gain.exponentialRampToValueAtTime(0.001, start + lengthSeconds);
  oscillator.connect(gain).connect(audio.destination);
  oscillator.start(start);
  oscillator.stop(start + lengthSeconds);
}

function chime(count) {
  for (let i = 0; i < count; i++) beep(880, i * 0.25, 0.18);
  navigator.vibrate?.(Array.from({ length: count * 2 - 1 }, () => 150));
}

function goTone() {
  beep(660, 0, 0.6);
  navigator.vibrate?.(400);
}

function tickTone() {
  beep(520, 0, 0.08);
}

function renderTimes() {
  $("times-list").replaceChildren(...Object.values(ROUTINES).map(timesGroup));
}

function timesGroup(routine) {
  const group = document.createElement("fieldset");
  const legend = document.createElement("legend");
  legend.textContent = routine.name;
  group.append(legend, ...routine.stretches.map(timeField));
  return group;
}

function timeField(stretch) {
  const label = document.createElement("label");
  label.className = "time-field";
  const name = document.createElement("span");
  name.textContent = stretch.name;
  const input = document.createElement("input");
  Object.assign(input, { type: "number", name: stretch.id, min: 5, max: 600, step: 5, required: true, inputMode: "numeric" });
  input.value = String(state.times[stretch.id] ?? DEFAULT_SECONDS);
  const unit = document.createElement("span");
  unit.className = "muted";
  unit.textContent = stretch.sides ? "sec each side" : "sec";
  label.append(name, input, unit);
  return label;
}

async function saveTimes(event) {
  event.preventDefault();
  const inputs = [...$("times-form").querySelectorAll("input")];
  const times = Object.fromEntries(inputs.map((input) => [input.name, Number(input.value)]));
  state.times = await request("PUT", "/api/times", { times });
  toast("Saved.");
  goTo("");
}

async function setUpReminders() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return showReminder("unsupported");
  state.registration = await navigator.serviceWorker.register("sw.js");
  await renderReminder();
}

async function renderReminder() {
  if (Notification.permission === "denied") return showReminder("blocked");
  const subscription = await currentSubscription();
  if (subscription) await request("POST", "/api/push/subscribe", { endpoint: subscription.endpoint });
  showReminder(subscription ? "on" : "off");
}

async function currentSubscription() {
  const subscription = await state.registration.pushManager.getSubscription();
  if (!subscription) return null;
  const { publicKey } = await request("GET", "/api/push/key");
  if (sameKey(subscription.options.applicationServerKey, publicKey)) return subscription;
  await subscription.unsubscribe();
  return null;
}

function sameKey(buffer, base64) {
  return buffer !== null && bytesToBase64Url(new Uint8Array(buffer)) === base64;
}

function bytesToBase64Url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function base64UrlToBytes(text) {
  const binary = atob(text.replaceAll("-", "+").replaceAll("_", "/"));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

function showReminder(mode) {
  $("reminder-status").textContent = REMINDER_TEXT[mode];
  $("reminder-on").hidden = mode !== "off";
  $("reminder-test").hidden = mode !== "on";
  $("reminder-off").hidden = mode !== "on";
}

async function turnOnReminders() {
  if ((await Notification.requestPermission()) !== "granted") return renderReminder();
  const { publicKey } = await request("GET", "/api/push/key");
  const subscription = await state.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(publicKey) });
  await request("POST", "/api/push/subscribe", { endpoint: subscription.endpoint });
  showReminder("on");
  toast("Reminders are on.");
}

async function turnOffReminders() {
  const subscription = await state.registration.pushManager.getSubscription();
  if (subscription) {
    await request("POST", "/api/push/unsubscribe", { endpoint: subscription.endpoint });
    await subscription.unsubscribe();
  }
  showReminder("off");
  toast("Reminders are off.");
}

async function sendTestReminder() {
  await request("POST", "/api/push/test");
  toast("Sent. It should show up in a few seconds.");
}

async function logIn(event) {
  event.preventDefault();
  $("login-error").textContent = "";
  try {
    await request("POST", "/api/login", { pin: $("pin").value });
    $("pin").value = "";
    await loadEverything();
    route();
  } catch (error) {
    $("login-error").textContent = error.message;
  }
}

function route() {
  const hash = location.hash;
  if (hash === "#stretch-lower" || hash === "#stretch-upper") {
    beginRoutine(hash.slice("#stretch-".length));
    return showView("session");
  }
  stopSession();
  if (hash === "#finished") return showView("finished");
  if (hash === "#times") {
    renderTimes();
    return showView("times");
  }
  renderHome();
  showView("home");
}

function refreshWhenShown() {
  if (document.visibilityState !== "visible") return;
  if (state.session) return keepScreenOn();
  if (!$("home").hidden) loadMonth().then(renderHome).catch(reportError);
}

function safely(handler) {
  return (...args) => Promise.resolve(handler(...args)).catch(reportError);
}

function wireEvents() {
  document.addEventListener("pointerdown", unlockAudio);
  window.addEventListener("hashchange", route);
  document.addEventListener("visibilitychange", refreshWhenShown);
  $("login-form").addEventListener("submit", logIn);
  $("lift").addEventListener("click", safely(toggleLift));
  $("stretch").addEventListener("click", toggleRoutines);
  $("prev-month").addEventListener("click", safely(() => moveMonth(-1)));
  $("next-month").addEventListener("click", safely(() => moveMonth(1)));
  $("day-dialog").addEventListener("close", safely(closeDay));
  $("session-pause").addEventListener("click", togglePause);
  $("session-skip").addEventListener("click", () => applySession("skip"));
  $("session-back").addEventListener("click", () => applySession("back"));
  $("session-end").addEventListener("click", askToEnd);
  $("end-dialog").addEventListener("close", closeEnd);
  $("times-form").addEventListener("submit", safely(saveTimes));
  $("reminder-on").addEventListener("click", safely(turnOnReminders));
  $("reminder-off").addEventListener("click", safely(turnOffReminders));
  $("reminder-test").addEventListener("click", safely(sendTestReminder));
}

async function start() {
  wireEvents();
  try {
    await loadEverything();
    route();
  } catch (error) {
    reportError(error);
  }
}

start();
