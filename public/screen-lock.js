export function createScreenLock() {
  let lock = null;
  let wanted = false;

  async function hold() {
    wanted = true;
    const acquired = await requestLock();
    if (wanted) {
      lock = acquired;
    } else {
      releaseLock(acquired);
    }
  }

  function release() {
    wanted = false;
    releaseLock(lock);
    lock = null;
  }

  function holdAgain() {
    if (wanted) {
      hold();
    }
  }

  return { hold, release, holdAgain };
}

async function requestLock() {
  try {
    return (await navigator.wakeLock?.request("screen")) ?? null;
  } catch {
    return null;
  }
}

function releaseLock(lock) {
  lock?.release().catch(() => {});
}
