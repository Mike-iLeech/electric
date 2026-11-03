"use strict";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// The updater reads the fixed GitHub provider from packaged app-update.yml.
// The renderer never supplies a feed, installer URL, path, or publisher name.
function createUpdateService({
  updater, app, readPreferences, patchPreferences, onChange = () => {},
  securityReady = () => false,
  now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout,
}) {
  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = false;
  updater.allowPrerelease = false;
  updater.allowDowngrade = false;
  updater.disableWebInstaller = true;

  let started = false, disposed = false, timer = null;
  let checking = null, downloading = null, lastAttempt = 0, downloaded = false;
  let current = {
    status: app.isPackaged ? "idle" : "dev",
    currentVersion: app.getVersion(), availableVersion: null, progress: null,
    errorCode: null, errorStage: null,
  };
  const enabled = () => readPreferences().autoUpdate === true;
  const signingReady = () => { try { return securityReady() === true; } catch { return false; } };
  function lastChecked() {
    const saved = readPreferences().lastUpdateCheck;
    return Math.max(lastAttempt, Number.isFinite(saved) && saved >= 0 ? saved : 0);
  }
  function nextCheck() {
    if (!app.isPackaged || !enabled() || downloaded || current.status === "installing") return null;
    const time = now(), last = lastChecked();
    // A clock correction must not postpone checks for months or years.
    return !last || last > time ? time : last + WEEK_MS;
  }
  function state() {
    const ready = signingReady();
    return {
      ...current,
      version: current.availableVersion || current.currentVersion,
      progress: current.progress?.percent || 0,
      downloadStats: current.progress ? { ...current.progress } : null,
      enabled: enabled(), signingReady: ready,
      lastCheckedAt: lastChecked() || null, nextCheckAt: nextCheck(),
      canCheck: !!app.isPackaged && !checking && !downloading && !downloaded && current.status !== "installing",
      canDownload: !!app.isPackaged && ready && !!current.availableVersion && !checking && !downloading && !downloaded,
      canInstall: !!app.isPackaged && ready && downloaded && !downloading && current.status !== "installing",
    };
  }
  function publish() {
    if (disposed) return;
    // A closed settings window must never turn a successful update into an error.
    try { onChange(state()); } catch {}
  }
  function update(patch) { current = { ...current, ...patch }; publish(); }
  function failure(error, stage) {
    const text = String(error?.code || "") + " " + String(error?.message || error || "");
    let code = stage + "-failed";
    if (/signature|publisher|certificate/i.test(text)) code = "signature";
    else if (/checksum|sha512|sha256/i.test(text)) code = "checksum";
    else if (/ERR_UPDATER_CHANNEL_FILE_NOT_FOUND|ERR_UPDATER_INVALID|YAML|parse/i.test(text)) code = "invalid-release";
    else if (stage === "check" && /404|ERR_UPDATER_LATEST_VERSION_NOT_FOUND|ERR_UPDATER_NO_PUBLISHED_VERSIONS|No published versions on GitHub/i.test(text)) code = "no-release";
    else if (/ENOTFOUND|ECONN|ETIMEDOUT|ERR_INTERNET|ERR_NETWORK|net::|offline/i.test(text)) code = "network";
    update({ status: code === "no-release" ? "no-release" : "error", errorCode: code, errorStage: stage });
  }
  function cancelTimer() {
    if (timer !== null) clearTimer(timer);
    timer = null;
  }
  function schedule() {
    cancelTimer();
    if (!started || disposed || checking || downloading) return;
    const due = nextCheck();
    if (due === null) return;
    timer = setTimer(() => { timer = null; void check({ manual: false }); }, Math.max(0, due - now()));
    timer?.unref?.();
  }
  function check({ manual = false } = {}) {
    if (disposed) return Promise.resolve(state());
    if (!app.isPackaged) { update({ status: "dev" }); return Promise.resolve(state()); }
    if (checking) return checking;
    if (downloading || downloaded || current.status === "installing" || (!manual && !enabled())) return Promise.resolve(state());
    if (!manual && nextCheck() > now()) { schedule(); return Promise.resolve(state()); }
    cancelTimer();
    checking = Promise.resolve().then(async () => {
      lastAttempt = now();
      try {
        // Record attempts, including offline/no-release results, to prevent a
        // failed check from repeating on every launch. Manual retries stay available.
        patchPreferences({ lastUpdateCheck: lastAttempt });
      } catch {
        update({ status: "error", errorCode: "preferences-write-failed", errorStage: "check" });
        return;
      }
      update({ status: "checking", availableVersion: null, progress: null, errorCode: null, errorStage: null });
      try {
        await updater.checkForUpdates();
        if (current.status === "checking") failure(new Error("Check unavailable"), "check");
      } catch (error) { failure(error, "check"); }
    }).finally(() => {
      checking = null;
      schedule();
      publish();
      if (!disposed && started && current.status === "available" && enabled() && signingReady())
        void download();
    }).then(state);
    return checking;
  }
  function download() {
    if (disposed || !app.isPackaged) return Promise.resolve(state());
    if (!signingReady()) {
      update({ status: "signing-required", errorCode: "signing-required", errorStage: "download" });
      return Promise.resolve(state());
    }
    if (downloading) return downloading;
    if (checking || downloaded || !current.availableVersion) return Promise.resolve(state());
    cancelTimer();
    downloading = Promise.resolve().then(async () => {
      update({ status: "downloading", progress: { percent: 0, transferred: 0, total: 0, bytesPerSecond: 0 }, errorCode: null, errorStage: null });
      try {
        await updater.downloadUpdate();
        if (current.status === "downloading") failure(new Error("Download did not complete"), "download");
      } catch (error) { failure(error, "download"); }
    }).finally(() => { downloading = null; schedule(); publish(); }).then(state);
    return downloading;
  }
  function install() {
    if (disposed || !app.isPackaged || !downloaded || downloading || current.status === "installing") return false;
    if (!signingReady()) {
      update({ status: "signing-required", errorCode: "signing-required", errorStage: "install" });
      return false;
    }
    // The main process must flush/confirm the editor BEFORE calling install().
    // Ordinary window close never installs an update.
    cancelTimer();
    update({ status: "installing", errorCode: null, errorStage: null });
    try {
      updater.quitAndInstall(false, true);
      // The SDK can emit an error synchronously instead of throwing.
      return current.status === "installing";
    }
    catch (error) { failure(error, "install"); return false; }
  }
  const version = info => typeof info?.version === "string" ? info.version.slice(0, 80) : null;
  const finite = value => Number.isFinite(value) ? Math.max(0, value) : 0;
  const handlers = {
    "update-available": info => update({ status: "available", availableVersion: version(info), errorCode: null, errorStage: null }),
    "update-not-available": () => update({ status: "up-to-date", availableVersion: null, errorCode: null, errorStage: null }),
    "download-progress": progress => update({ status: "downloading", progress: {
      percent: Math.min(100, finite(progress.percent)), transferred: finite(progress.transferred),
      total: finite(progress.total), bytesPerSecond: finite(progress.bytesPerSecond),
    } }),
    "update-downloaded": info => {
      // electron-updater emits this only after download/checksum/signature checks.
      downloaded = true;
      update({ status: "downloaded", availableVersion: version(info) || current.availableVersion,
        progress: current.progress ? { ...current.progress, percent: 100 } : null, errorCode: null, errorStage: null });
    },
    "update-cancelled": () => update({ status: "available", progress: null, errorCode: null, errorStage: null }),
    error: error => failure(error, downloading ? "download" : current.status === "installing" ? "install" : "check"),
  };
  for (const [name, handler] of Object.entries(handlers)) updater.on(name, handler);
  return {
    state, check, download, install,
    start() { if (disposed) return; started = true; schedule(); publish(); },
    stop() { started = false; cancelTimer(); },
    refreshSchedule() { schedule(); publish(); },
    dispose() {
      started = false; disposed = true; cancelTimer();
      for (const [name, handler] of Object.entries(handlers)) updater.removeListener(name, handler);
    },
  };
}

module.exports = { createUpdateService, WEEK_MS };
