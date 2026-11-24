import { byId } from "./dom.js";

const SHOW_MS = 2500;
let hideTimer = null;

export function showToast(message) {
  const box = byId("toast");
  box.textContent = message;
  box.classList.add("show");
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => box.classList.remove("show"), SHOW_MS);
}
