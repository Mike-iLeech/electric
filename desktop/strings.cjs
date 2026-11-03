"use strict";
const en = {
  "Проект": "Project", "Сохранить текущий проект": "Save current project",
  "Сохранить копию JSON…": "Save JSON copy…", "Импортировать JSON…": "Import JSON…",
  "Экспорт схемы…": "Export drawing…", "Открыть папку данных": "Open data folder",
  "Выход": "Exit", "Окно": "Window", "На весь экран": "Full screen",
  "Помощь": "Help", "Справка": "User guide", "О программе": "About",
  "Настройки": "Settings", "Настройки приложения…": "Application settings…",
  "Проверить обновления…": "Check for updates…", "Обновление готово": "Update ready",
  "Данные не сохранены": "Unsaved changes", "Не удалось сохранить изменения на диск.": "Changes could not be saved to disk.",
  "Вернитесь в редактор и сохраните проект в JSON или проверьте доступ к папке данных.": "Return to the editor and export a JSON copy or check access to the data folder.",
  "Вернуться в редактор": "Return to editor", "Закрыть без сохранения": "Close without saving",
  "Сохранить": "Save", "Не удалось сохранить файл": "Could not save the file",
  "Проверьте свободное место и доступ к выбранной папке.": "Check free disk space and access to the selected folder.",
  "Настройки ElectricCAD Easy": "ElectricCAD Easy settings",
  "Сначала сохраните проект": "Save the project first",
  "Обновление не установлено: не удалось сохранить текущие данные.": "The update was not installed because the current data could not be saved.",
  "Папка данных": "Data folder",
  "Автономный редактор электрических схем.": "Offline electrical diagram editor.",
  "Сайт и Windows-приложение хранят проекты отдельно. Для переноса используйте JSON.": "The website and Windows app store projects separately. Use JSON to transfer projects.",
};
module.exports = (language, value) => language === "en" ? en[value] || value : value;
