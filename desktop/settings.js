"use strict";
(() => {
  const api = window.electricDesktop, $ = id => document.getElementById(id);
  if(!api?.getSettings)return;
  const messages = {
    ru: {
      title:"Настройки", languageTitle:"Язык приложения", languageLabel:"Язык интерфейса", languageHint:"Применяется сразу. Названия ваших проектов и модулей сохраняются.",
      updatesTitle:"Обновления", automatic:"Автоматические обновления", weekly:"Проверять GitHub Releases раз в неделю",
      updateHint:"Новая версия загружается в фоне. Установка и перезапуск — по вашей команде, после сохранения проекта.",
      check:"Проверить сейчас", download:"Скачать обновление", install:"Установить и перезапустить", releases:"Релизы на GitHub ↗",
      dataTitle:"Данные приложения", openData:"Открыть папку данных", dataHint:"Проекты, настройки и резервные копии хранятся отдельно от программы. При удалении их можно сохранить или удалить.",
      saved:"Настройки сохраняются автоматически", idle:"Проверка ещё не выполнена", checking:"Проверяем наличие обновлений…", available:"Доступна версия", downloading:"Загружаем обновление…", downloaded:"Обновление готово к установке", "up-to-date":"Установлена актуальная версия", error:"Не удалось проверить или загрузить обновление. Проверьте подключение и наличие опубликованного релиза.", dev:"Проверка обновлений доступна в установленном приложении", disabled:"Автоматическая проверка отключена", never:"Последняя проверка: ещё не выполнялась", last:"Последняя проверка: ", failure:"Не удалось сохранить настройки или выполнить действие. Проверьте доступ к папке данных.",
    },
    en: {
      title:"Settings", languageTitle:"Application language", languageLabel:"Interface language", languageHint:"Applied immediately. Your project and module names are preserved.",
      updatesTitle:"Updates", automatic:"Automatic updates", weekly:"Check GitHub Releases once a week",
      updateHint:"New versions download in the background. Installation and restart happen when you choose, after saving your project.",
      check:"Check now", download:"Download update", install:"Install and restart", releases:"GitHub releases ↗",
      dataTitle:"Application data", openData:"Open data folder", dataHint:"Projects, settings and backups are stored separately from the application. You can keep or delete them during uninstall.",
      saved:"Settings are saved automatically", idle:"No update check yet", checking:"Checking for updates…", available:"Version available:", downloading:"Downloading update…", downloaded:"Update ready to install", "up-to-date":"You have the latest version", error:"Could not check for or download an update. Check your connection and whether a release has been published.", dev:"Update checks are available in the installed application", disabled:"Automatic checks are disabled", never:"Last checked: never", last:"Last checked: ", failure:"Could not save settings or complete the action. Check access to the data folder.",
    },
  };
  Object.assign(messages.ru, {"no-release":"В GitHub пока нет опубликованного обновления", installing:"Устанавливаем обновление…"});
  Object.assign(messages.en, {"no-release":"No update has been published on GitHub yet", installing:"Installing update…"});
  const errors = {
    ru: {signature:"Не пройдена проверка подписи издателя. Обновление не установлено.", checksum:"Файл обновления повреждён. Повторите загрузку.", network:"Не удалось подключиться к GitHub. Проверьте интернет и повторите проверку.", "invalid-release":"В релизе отсутствуют корректные данные обновления. Дождитесь исправленного выпуска.", "preferences-write-failed":"Не удалось сохранить дату проверки. Проверьте доступ к папке данных и свободное место.", "install-failed":"Не удалось запустить установщик обновления. Попробуйте снова после сохранения проекта."},
    en: {signature:"Publisher signature verification failed. The update was not installed.", checksum:"The update file is corrupted. Download it again.", network:"Could not connect to GitHub. Check your internet connection and try again.", "invalid-release":"This release has invalid update metadata. Please wait for a corrected release.", "preferences-write-failed":"Could not save the check date. Check data folder access and free disk space.", "install-failed":"Could not start the update installer. Save your project and try again."},
  };
  let snapshot;
  function render(value) {
    snapshot = value;
    const { preferences: p, update: u } = value, m = messages[p.language] || messages.ru;
    document.documentElement.lang = p.language; if(location.pathname.endsWith("settings.html")) document.title = m.title + " — ElectricCAD Easy";
    for (const item of document.querySelectorAll("[data-text]")) item.textContent = m[item.dataset.text];
    if($("version")) $("version").textContent = "ElectricCAD Easy " + value.version;
    $("language").value = p.language; $("autoUpdate").checked = p.autoUpdate;
    $("dataPath").textContent = value.dataDirectory;
    $("lastCheck").textContent = p.lastUpdateCheck ? m.last + new Date(p.lastUpdateCheck).toLocaleString(p.language === "ru" ? "ru-RU" : "en-US") : m.never;
    $("updateStatus").textContent = ((u.status === "error" && errors[p.language]?.[u.errorCode]) || m[u.status] || m.idle) +
      (u.availableVersion && ["available","downloading","downloaded","installing"].includes(u.status) ? " " + u.availableVersion : "");
    $("progress").hidden = u.status !== "downloading";
    $("progress").value = Number(u.progress) || 0;
    $("check").disabled = !u.canCheck || ["checking", "downloading"].includes(u.status);
    $("download").hidden = !u.canDownload; $("install").hidden = !u.canInstall;
  }
  async function run(task) {
    $("error").hidden = true;
    try { const value = await task(); if (value) render(value); }
    catch { $("error").textContent = messages[snapshot?.preferences.language || "ru"].failure; $("error").hidden = false; if (snapshot) render(snapshot); }
  }
  $("language").onchange = () => run(() => api.setPreferences({language:$("language").value}));
  $("autoUpdate").onchange = () => run(() => api.setPreferences({autoUpdate:$("autoUpdate").checked}));
  $("check").onclick = () => run(() => api.checkUpdates());
  $("download").onclick = () => run(() => api.downloadUpdate());
  $("install").onclick = () => run(() => api.installUpdate());
  $("openData").onclick = () => run(() => api.openDataFolder());
  api.onSettingsChanged(render);
  run(() => api.getSettings());
})();
