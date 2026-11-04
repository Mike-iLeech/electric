(function (root) {
  "use strict";
  const phrases = `
Загрузить проект|||Load project
Загрузить проект с диска|||Load project from disk
Загрузить Демо-Проект|||Load demo project
Импорт JSON · ПКМ — выбрать источник проекта|||Import JSON · Right click — choose project source
СЕТЬ|||GRID
Вид ввода|||Source type
Ввод — щит|||Supply — panel
Ввод — розетка|||Supply — socket
Предпросмотр модуля|||Module preview
Автомат на входе, А|||Input breaker, A
Разъём выхода по умолчанию|||Default output connector
Сохранить в каталог|||Save to catalog
Добавить в схему (без сохранения)|||Add to drawing (without saving)
Экспорт JSON|||Export JSON
Импорт JSON|||Import JSON
Импорт JSON · ПКМ — загрузить демо-схему|||Import JSON · Right click — load demo drawing
Демо-схема загружена. Ctrl+Z — отменить.|||Demo drawing loaded. Ctrl+Z — undo.
← Хаб|||← Hub
Проект|||Project
Название проекта|||Project name
Сохранить|||Save
Скачать|||Download
Экспорт|||Export
Импорт|||Import
Очистить|||Clear
Открыть папку данных|||Open data folder
Каталог модулей|||Module catalog
фокус|||focus
пан|||pan
Фазное, В|||Phase, V
Линейное, В|||Line, V
Настройки|||Settings
Настройки приложения|||Application settings
Обновления и данные PC|||PC updates and data
Настройки мира|||World settings
Язык приложения|||Application language
Язык интерфейса|||Interface language
Применяется сразу. Названия ваших проектов и модулей сохраняются.|||Applied immediately. Your project and module names are preserved.
Обновления|||Updates
Автоматические обновления|||Automatic updates
Проверять GitHub Releases раз в неделю|||Check GitHub Releases once a week
Новая версия загружается в фоне. Установка и перезапуск — по вашей команде, после сохранения проекта.|||New versions download in the background. Installation and restart happen when you choose, after saving your project.
Проверить сейчас|||Check now
Скачать обновление|||Download update
Установить и перезапустить|||Install and restart
Релизы на GitHub ↗|||GitHub releases ↗
Данные приложения|||Application data
Открыть папку данных|||Open data folder
Проекты, настройки и резервные копии хранятся отдельно от программы. При удалении их можно сохранить или удалить.|||Projects, settings and backups are stored separately from the application. You can keep or delete them during uninstall.
Настройки сохраняются автоматически|||Settings are saved automatically
Русский|||Russian
cos φ — коэффициент мощности|||cos φ — power factor
Что такое cos φ?|||What is cos φ?
Модель активной нагрузки: PF = cos φ, частота 50 Гц. Индивидуальные параметры кабельной линии имеют приоритет над настройками мира.|||Sinusoidal model: PF = cos φ, grid frequency 50 Hz. Individual cable parameters override defaults.
Модель учитывает активную нагрузку: PF = cos φ, частота сети — 50 Гц. Для симметричной сети Uл = √3 × Uф.|||Sinusoidal model: PF = cos φ, grid frequency 50 Hz. Individual cable parameters override defaults.
Модель активной нагрузки: PF = cos φ = 1, частота 50 Гц. Индивидуальные параметры кабельной линии имеют приоритет над настройками мира.|||Model of active loads: PF = cos φ = 1, grid frequency 50 Hz. Individual cable parameters override world defaults.
Значения по номиналу линии. Применяются к кабелям без своего сечения.|||Default values by circuit rating. Applied to cables without a custom cross-section.
Модель учитывает активную нагрузку: PF = cos φ = 1, частота сети — 50 Гц. Для симметричной сети Uл = √3 × Uф.|||The model considers active loads: PF = cos φ = 1, grid frequency 50 Hz. For a balanced grid Uline = √3 × Uphase.
Автоматы используют пороговую модель по току. Падение напряжения и потери оцениваются по длине, материалу и сечению кабеля. Тепловая оценка доступна при заданном тепловом сопротивлении.|||Breakers use a current-threshold model. Voltage drop and losses are estimated from cable length, material and cross-section. Thermal estimates require thermal resistance.
Режимы работы|||Operating modes
Управление|||Controls
Номинал, А|||Rating, A
Сечение, мм²|||Cross-section, mm²
Допущения модели|||Model assumptions
Подробнее — справка|||Learn more — help
Температура среды по умолчанию, °C|||Default ambient temperature, °C
Предел падения U на участке, %|||Section voltage drop limit, %
Тепловое сопротивление участка по умолчанию, К/Вт|||Default section thermal resistance, K/W
Материал проводников по умолчанию|||Default conductor material
Коэффициент мощности PF|||Power factor PF
Частота электрической сети, Гц|||Grid frequency, Hz
Разъём|||Connector
Фаза|||Phase
Номинал автомата, А|||Breaker rating, A
Характеристика|||Curve
Авто · по размеру схемы|||Auto · fit drawing size
Нет свободного места|||No free space
Файл больше 12 МБ|||File exceeds 12 MB
Проект импортирован. Фазы пересчитаны по схеме.|||Project imported. Phases recalculated from the drawing.
Схема электрическая однолинейная|||Single-line electrical diagram
ElectricCAD Easy — конструктор электросетей|||ElectricCAD Easy — electrical network editor
PF=1 · 50 Гц · Uл = √3 × Uф|||PF=1 · 50 Hz · Uline = √3 × Uphase
Каждая ветка на отдельном листе|||Each branch on a separate sheet
конструктор модуля|||module editor
КЛ1|||T1
КЛ3|||T3
Продвинутый режим|||Advanced mode
Кабели, сценарии защиты и разъёмы в свойствах портов. Резервный ввод в свойствах дистрибьютора. Расширенный поиск трасс.|||Cables, protection scenarios and connectors in port properties. Backup input in distributor properties. Extended route search.
Подсветка всей ветки|||Highlight entire branch
Выделите начальную и конечную ноду с Shift или Ctrl: подсветится путь между ними.|||Select the first and last modules with Shift or Ctrl to highlight the path between them.
Срабатывание автоматов|||Automatic breaker tripping
Автоматически отключать автоматы при превышении номинального тока.|||Automatically trip breakers when their rated current is exceeded.
Включить все автоматы|||Switch on all breakers
Проверить автоматы|||Check breakers
Допущения модели|||Model assumptions
PF = 1 — коэффициент мощности принят равным единице: учитываем активную нагрузку, без реактивной составляющей.|||PF = 1: the model uses active power only, with no reactive component.
50 Гц — частота сети. Uф — фазное напряжение между фазой и нейтралью; Uл — линейное между фазами. Для симметричной трёхфазной сети Uл = √3 × Uф. Изменение одного поля пересчитывает второе.|||50 Hz supply frequency. Uphase is phase-to-neutral voltage; Uline is phase-to-phase voltage. For a balanced three-phase supply Uline = √3 × Uphase. Editing either voltage updates the other.
Автоматы — пороговая модель по току. B/C/D — справочные характеристики. Продвинутый режим даёт оценку потерь и падения напряжения на заданном кабеле.|||Breakers use a current-threshold model. B/C/D are reference characteristics. Advanced mode estimates cable losses and voltage drop.
Сечения кабелей|||Cable cross-sections
Помощь|||Help
Итого|||Total
Дерево проекта|||Project tree
Быстрый выбор|||Quick selection
Выберите модуль…|||Select a module…
Свойства|||Properties
ничего не выбрано|||nothing selected
Выберите ноду (ЛКМ) или несколько (SHIFT+ЛКМ / лассо).|||Select a module (left click) or several (Shift+click / selection box).
Каталог / проект|||Catalog / project
Дерево проекта / свойства|||Project tree / properties
Справка ElectricCAD Easy|||ElectricCAD Easy help
Закрыть|||Close
Поиск по справке|||Search help
Начало|||Getting started
Управление|||Controls
Каталог|||Catalog
Соединения|||Connections
Кабели|||Cables
Сообщения|||Messages
Расчёты|||Calculations
Защита|||Protection
Ничего не найдено. Попробуйте другое слово.|||No results. Try another word.
Конструктор модуля|||Module editor
Тип|||Type
Ввод / щит|||Supply / distribution board
Дистрибьютор|||Distributor
Удлинитель / переход|||Extension / adapter
Потребитель|||Load
Фазность модуля|||Module phases
Однофазный|||Single-phase
Трёхфазный|||Three-phase
Название|||Name
Доступный ток источника, А|||Available supply current, A
Щит с автоматами|||Board with breakers
Вход слева|||Input on the left
Разъём входа|||Input connector
Номинал входа, А|||Input rating, A
Потребление, Вт|||Power consumption, W
Вводной автомат, А|||Main breaker, A
Связанный 3P для трёхфазного, 1P для однофазного модуля. Коммутируемые N/PE не моделируются.|||Linked 3P for three-phase modules, 1P for single-phase modules. Switched N/PE is not modeled.
Выходы справа|||Outputs on the right
Количество выходов|||Number of outputs
Разъём по умолчанию|||Default connector
Номинал по умолчанию, А|||Default rating, A
Применить ко всем выходам|||Apply to all outputs
Каждый выход настраивается отдельно ниже: разъём, номинал, фаза и автомат. Для 1ф ветки фаза наследуется от питания.|||Configure each output below: connector, rating, phase and breaker. Single-phase branches inherit the supply phase.
Порты и автоматы выходов|||Output ports and breakers
Сохранить в свой каталог|||Save to custom catalog
Создать|||Create
Значения по номиналу линии. Применяются к кабелям без своего сечения.|||Defaults by line rating, used for cables without a custom cross-section.
Номинал|||Rating
Сечение, мм²|||Cross-section, mm²
Отмена|||Cancel
Настройки кабельной линии|||Cable settings
Длина кабельной трассы|||Cable length
Длина, м|||Length, m
Предел длины для данной кабельной линии|||Length limits for this cable
По нормативу ΔU < 5%|||Voltage drop ΔU < 5%
По нагрузке линии|||For the line load
Общий предел (ΔU = 100%)|||Absolute limit (ΔU = 100%)
Журнал действий|||Activity log
Скопировать весь лог|||Copy entire log
Вернуться в хаб|||Return to hub
Скачать проект JSON|||Download project JSON
Экспорт схемы и проекта|||Export drawing and project
Импорт JSON|||Import JSON
Размер блока проекта и каталога|||Resize project and catalog panels
Создать свой модуль|||Create a custom module
Экспорт своих модулей в JSON|||Export custom modules to JSON
Импорт модулей из JSON|||Import modules from JSON
Поиск в каталоге|||Search catalog
Модуль, разъём, номинал…|||Module, connector, rating…
Скрыть левую панель|||Hide left sidebar
Скрыть правую панель|||Hide right sidebar
Показать левую панель|||Show left sidebar
Показать правую панель|||Show right sidebar
Привязка к сетке · 12|||Snap to grid · 12
Привязка к сетке|||Snap to grid
Отменить|||Undo
Повторить|||Redo
Вся схема|||Fit entire drawing
Уменьшить масштаб|||Zoom out
Увеличить масштаб|||Zoom in
На сенсорном экране: лассо по пустому месту|||Touch screen: drag a selection box on empty space
Выделение|||Select
Перетаскивание полотна|||Pan the canvas
Панорама|||Pan
Копия|||Copy
Вставить|||Paste
Вставлено|||Pasted
Удалить|||Delete
Разъединить порт|||Disconnect port
Включить вводные и портовые автоматы всей схемы|||Switch on all main and port breakers
Отключить включённые автоматы, где текущий ток выше номинала|||Trip closed breakers whose current exceeds their rating
Редактор схемы. Tab — панели, стрелки — перемещение выбранного модуля, Delete — удалить.|||Drawing editor. Tab: panels; arrows: move selected modules; Delete: delete.
Исходный код на GitHub|||Source code on GitHub
Модули проекта|||Project modules
Размер дерева проекта и свойств|||Resize project tree and properties
Панели редактора|||Editor panels
Закрыть панель|||Close sidebar
Справка|||Help
Инструмент, сообщение или расчёт…|||Tool, message or calculation…
Разделы справки|||Help topics
Название модуля|||Module name
Предпросмотр модуля|||Module preview
По умолчанию|||Default
Введите длину|||Enter a length
Не удалось сохранить настройки. Проверьте доступ к папке данных.|||Could not save settings. Check access to the data folder.
Не удалось сохранить проект на диск. Сохраните копию JSON и проверьте папку данных.|||Could not save the project to disk. Save a JSON copy and check the data folder.
Не удалось сохранить сессию в браузере. Экспортируйте JSON.|||Could not save the browser session. Export a JSON copy.
Ошибка локального сохранения|||Local save error
Сохраняется…|||Saving…
Сохранено на этом компьютере|||Saved on this computer
Сохранено в этом браузере|||Saved in this browser
Нет места для вставки|||No room to paste
Отключить|||Switch off
Включить / взвести|||Switch on / reset
Номинал, А|||Rating, A
Характеристика автомата|||Breaker curve
Сценарий защиты участка|||Line protection scenario
Система заземления|||Earthing system
Импеданс петли L–PE, Ом|||L–PE loop impedance, Ω
Сопротивление заземлителя TT, Ом|||TT earth electrode resistance, Ω
Номинальный дифференциальный ток УЗО, мА|||Rated RCD residual current, mA
Дифференциальный ток сценария, мА|||Scenario residual current, mA
Время отключения по измерению, с|||Measured disconnection time, s
Допустимое время отключения, с|||Maximum disconnection time, s
Пусковой ток, А|||Starting current, A
Длительность пуска, с|||Starting duration, s
Число одинаковых пусков|||Number of identical starts
Пауза между пусками, с|||Pause between starts, s
Постоянная остывания, с|||Cooling time constant, s
Автомат участка|||Line breaker
Автомат выше по цепи|||Upstream breaker
[[ток, время мин., время макс.], …]|||[[current, minimum time, maximum time], …]
Нужны точки паспортной кривой с возрастающим током и диапазоном времени|||Enter manufacturer curve points with increasing current and valid time ranges
Для IT нужна отдельная модель первого и второго замыкания.|||IT requires a separate model for the first and second faults.
При заданном токе диапазоны времени разделены.|||Time ranges are separated at the specified current.
При заданном токе селективность по времени не подтверждена.|||Time selectivity is not confirmed at the specified current.
Достигнут номинальный дифференциальный ток УЗО.|||The rated RCD residual-current threshold has been reached.
Дифференциальный ток ниже номинального порога УЗО.|||Residual current is below the rated RCD threshold.
Измеренное время укладывается в заданный предел.|||Measured disconnection time is within the specified limit.
Измеренное время превышает заданный предел.|||Measured disconnection time exceeds the specified limit.
Задайте параметры измерения или паспортные точки автоматов.|||Enter measured parameters or manufacturer breaker-curve points.
Падение напряжения превышает 100%. Сократите длину трассы, увеличьте сечение или снизьте нагрузку.|||Voltage drop exceeds 100%. Shorten the cable, increase its cross-section or reduce the load.
Кабель · модельный профиль Cu, PF = 1|||Cable · model profile Cu, PF = 1
Справка по типовому кабелю на 100 метров|||Reference cable calculation for 100 metres
Методика расчёта|||Calculation method
Сбросить профиль кабеля|||Reset cable profile
Сечение жилы, мм²|||Conductor cross-section, mm²
Допустимый ток для условий прокладки, А|||Permitted current for installation conditions, A
Предел падения на участке, %|||Line voltage-drop limit, %
Температура среды, °C|||Ambient temperature, °C
Тепловое сопротивление участка, К/Вт|||Line thermal resistance, K/W
Материал жил|||Conductor material
Медь|||Copper
Алюминий|||Aluminium
Задайте длину, сечение и допустимый ток.|||Enter length, cross-section and permitted current.
Превышен допустимый ток кабеля.|||Permitted cable current exceeded.
Для несимметричной трёхфазной нагрузки падение напряжения и потери не оценены.|||Voltage drop and losses have not been estimated for this unbalanced three-phase load.
Для оценки всей ветки задайте длину каждого участка.|||Enter the length of each cable to evaluate the entire branch.
Изменить модуль / порты|||Edit module / ports
Убрать резервный ввод|||Remove backup input
Добавить резервный ввод (АВР)|||Add backup input (ATS)
Сначала разъедините резервный ввод|||Disconnect the backup input first
АВР: резервный ввод|||ATS: backup input
АВР: основной ввод|||ATS: main input
АВР: питание отсутствует|||ATS: no supply
Вводной автомат|||Main breaker
Основной ввод|||Main input
Резервный ввод|||Backup input
Вход|||Input
Выход|||Output
Производитель|||Manufacturer
Артикул|||Part number
Степень IP|||IP rating
Механический ключ|||Mechanical key
Автомат линии|||Line breaker
Выбрать для соединения|||Select for connection
Нажмите второй порт на схеме или в свойствах|||Click the second port on the drawing or in properties
Разъединить|||Disconnect
Мощность каждого выбранного потребителя, Вт|||Power of each selected load, W
Введите мощность|||Enter a power value
Разные значения|||Mixed values
Значения различаются. Ввод заменит мощность у всех выбранных потребителей.|||Values differ. Entering a value changes the power of every selected load.
Удалить выбранные|||Delete selected
Добавьте модуль из каталога|||Add a module from the catalog
Не удалось сохранить каталог|||Could not save the catalog
Удалить шаблон|||Delete template
Ничего не найдено|||No results
Не удалось загрузить шрифт OpenGOST|||Could not load the OpenGOST font
Предпросмотр листа: колесо мыши — масштаб, перетаскивание — панорама|||Sheet preview: mouse wheel to zoom, drag to pan
Экспорт схемы|||Export drawing
Превью экспорта схемы|||Drawing export preview
Вся электрическая схема для экспорта|||Entire electrical drawing for export
Масштаб предпросмотра|||Preview zoom
Уменьшить предпросмотр|||Zoom preview out
Увеличить предпросмотр|||Zoom preview in
Показать весь лист|||Fit entire sheet
Схема|||Drawing
Сохранить PNG|||Save PNG
Сохранить JPG|||Save JPG
Сохранить PDF|||Save PDF
Сохранить проект JSON|||Save project JSON
Лист превью|||Preview sheet
Кабельный журнал|||Cable schedule
Все ветки|||All branches
Название детали|||Drawing title
Обозначение|||Designation
Проектировщик|||Designer
Дата чертежа|||Drawing date
Формат листа|||Paper size
Ориентация|||Orientation
Книжная|||Portrait
Альбомная|||Landscape
Масштаб схемы|||Drawing scale
Выгрузка кабельного журнала|||Include cable schedule
Схема по веткам|||Drawing by branch
Журнал по веткам|||Schedule by branch
Каждая ветка кабельного журнала на отдельном листе|||Each cable schedule branch on a separate sheet
Компоновка: вертикаль ↔ горизонталь|||Layout: vertical ↔ horizontal
Новый модуль|||New module
Источник|||Supply
Применить изменения|||Apply changes
Сначала разъедините удаляемые порты|||Disconnect the ports being removed first
В файле есть неподдерживаемый шаблон|||The file contains an unsupported template
Файл модулей больше 2 МБ|||Module file exceeds 2 MB
Ожидается JSON со списком пользовательских модулей|||Expected a JSON list of custom modules
Все модули из файла уже есть в каталоге|||All modules from this file are already in the catalog
Шаблон сохранён в локальном каталоге|||Template saved to the local catalog
Не удалось открыть папку данных|||Could not open the data folder
Весь лог скопирован|||Entire log copied
Лог выделен. Нажмите Ctrl+C, чтобы скопировать.|||Log selected. Press Ctrl+C to copy it.
ресурс недоступен|||resource unavailable
Редактор запущен|||Editor started
Восстановлена резервная локальная сессия|||Local backup session restored
Локальная сессия недоступна или повреждена. Исходные данные сохранены в хранилище; открыт пустой проект.|||The local session is unavailable or damaged. Original data remains in storage; an empty project was opened.
Проект сохранён на компьютере. Для отдельной копии используйте «Скачать».|||Project saved on this computer. Use Download to save a separate copy.
Сессия сохранена локально. Для переноса используйте Экспорт JSON.|||Session saved locally. Export JSON to transfer it.
Перестроить все трассы|||Rebuild all routes
Пересчитать маршруты всех кабелей и сбросить ручные изгибы|||Recalculate all cable routes and reset manual bends
Авторасстановка модулей|||Adjust module spacing
Раздвинуть модули там, где зазор меньше 96 единиц|||Separate modules where the gap is less than 96 units
Нехватка мощности выше по цепи питания. Изменение длины этой трассы не устраняет вышестоящее ограничение.|||Insufficient upstream capacity. Changing this cable length does not remove the upstream limit.
нет предела при текущем токе|||unlimited at the current load
нет допустимой длины|||no permissible length
Воспроизвести GIF|||Play GIF
Остановить|||Stop
Изображение из справки|||Help illustration
Закрыть изображение|||Close illustration
Новый проект|||New project
Сначала нажмите порт|||Select a port first
Все автоматы уже включены|||All breakers are already on
Перегрузок включённых автоматов нет|||No closed breakers are overloaded
Проект изменён в другой вкладке. Экспортируйте свою версию перед перезагрузкой.|||The project changed in another tab. Export your version before reloading.
1ф|||1-phase
3ф|||3-phase
Клеммный ввод 1ф|||1-phase terminal supply
Клеммный ввод 3ф|||3-phase terminal supply
Клеммы P+N+PE|||Terminals P+N+PE
Клеммы 3P+N+PE|||Terminals 3P+N+PE
Ввод|||Supply
Щит с клеммным вводом|||Terminal input board
Щит|||Distribution board
Переход|||Adapter
Удлинитель|||Extension
CEE 1ф|||CEE 1-phase
CEE 3ф|||CEE 3-phase
Клеммы 1ф|||1-phase terminals
Клеммы 3ф|||3-phase terminals
Сеть|||Mains
Нет выходов|||No outputs
Кабель с голыми концами|||Bare-end cable
Неизвестный разъём|||Unknown connector
Порт не найден|||Port not found
Соединение только выход → вход|||Connections must run from output to input
Разные механические ключи|||Different mechanical keys
Разная фазность|||Different phase counts
Разные разъёмы: нужен переходник|||Different connectors: an adapter is required
Разные типоразмеры разъёма по току|||Different connector current ratings
Совместимо|||Compatible
Узел нельзя соединить с собой|||A module cannot connect to itself
Порт уже занят|||Port already in use
Циклы запрещены|||Loops are not allowed
Можно соединить|||Can connect
Автомат|||Breaker
Число полюсов автомата не соответствует фазности|||Breaker pole count does not match phase count
Некорректный автомат|||Invalid breaker
Неподдерживаемый формат проекта|||Unsupported project format
Фазное напряжение|||Phase voltage
Модель поддерживает PF=1 и 50 Гц|||The model supports PF=1 and 50 Hz
Масштаб|||Zoom
Слишком большой или неверный проект|||Project is too large or invalid
Повторяющийся ID|||Duplicate ID
Имя узла|||Module name
Шаблон|||Template
Неверный тип узла|||Invalid module type
Мощность|||Power
Неверное число портов|||Invalid port count
Фазность входа отличается от модуля|||Input phases differ from the module
Неверные данные разъёма|||Invalid connector data
Неверный разъём|||Invalid connector
Номинал порта|||Port rating
Такого номинала нет в каталоге разъёмов|||This rating is not in the connector catalog
Пассивный переход 1ф → 3ф невозможен|||A passive single-phase to three-phase adapter is impossible
Выберите фазу выхода|||Select the output phase
Неверная фаза|||Invalid phase
Автомат выше номинала порта|||Breaker exceeds the port rating
Номинал источника|||Supply rating
Вводной автомат выше номинала ввода|||Main breaker exceeds the input rating
Неверные параметры защиты|||Invalid protection parameters
Неверная система заземления|||Invalid earthing system
Неверная трасса кабеля|||Invalid cable route
Координата трассы X|||Route X coordinate
Координата трассы Y|||Route Y coordinate
Неверные параметры кабеля|||Invalid cable parameters
Длина кабеля|||Cable length
Сечение кабеля|||Cable cross-section
Допустимый ток кабеля|||Permitted cable current
Предел падения напряжения|||Voltage-drop limit
Положение подписи кабеля|||Cable label position
Температура среды|||Ambient temperature
Тепловое сопротивление|||Thermal resistance
Неверный материал жил|||Invalid conductor material
Связь: порт не найден|||Connection: port not found
Связь: узел соединён с собой|||Connection: module connected to itself
Связь: порт уже занят|||Connection: port already in use
Связь: циклы запрещены|||Connection: loops are not allowed
Неверный JSON проекта|||Invalid project JSON
Файл другого приложения|||File belongs to another application
Расчёт остановлен: цикл в схеме|||Calculation stopped: loop in the drawing
Под питанием|||Powered
Отключено автоматом|||Breaker off
Нет источника|||No supply
Увеличьте сечение, снизьте нагрузку или сократите длину линии. При превышении номинала разъёмов снизьте нагрузку или замените разъёмы.|||Increase cross-section, reduce the load or shorten the cable. If connector ratings are exceeded, reduce the load or replace the connectors.
Не удалось найти свободное место|||Could not find free space
Трёхфазные|||Three-phase
Однофазные|||Single-phase
Клеммные|||Terminals
Другие|||Other
Вводы|||Supplies
Щиты|||Distribution boards
С автоматом (клеммный ввод)|||With breaker (terminal input)
С розеткой|||With socket
Розетки|||Sockets
Дистрибьюторы|||Distributors
Потребители|||Loads
Переходные коробки и кабели|||Adapter boxes and cables
Удлинители|||Extensions
⚠ ПЕРЕГРУЗКА|||⚠ OVERLOAD
⚠ ДИСБАЛАНС ФАЗ|||⚠ PHASE IMBALANCE
⚠ НЕ ХВАТАЕТ МОЩНОСТИ (ΔU)|||⚠ INSUFFICIENT POWER (ΔU)
ВКЛ|||ON
ВЫКЛ|||OFF
ВЫБИТ|||TRIPPED
Недостаточно мощности из-за падения напряжения.|||Insufficient power due to voltage drop.
Темы управления|||Control topics
Демонстрации|||Demonstrations
Клавиатура|||Keyboard
Увеличить|||Enlarge
Соединение портов|||Connecting ports
Перемещение модулей|||Moving modules
Перемещение кабеля|||Moving cables
Перемещение|||Movement
Начало работы|||Getting started
Проект, панели и сохранение|||Project, panels and saving
Каталог и создание модулей|||Catalog and custom modules
Порты и трассировка|||Ports and routing
Свойства, фазы и автоматы|||Properties, phases and breakers
Кабели и режимы|||Cables and modes
Экспорт схемы и кабельный журнал|||Drawing export and cable schedule
Уведомления и предупреждения|||Notifications and warnings
Как рассчитываются значения|||How values are calculated
Дополнительные оценки защиты|||Additional protection estimates
`;
  const dictionary = new Map(phrases.trim().split("\n").map(line => line.split("|||")));
  const fragments = [
    ["Перегрузка на фазе: ", "Phase overload: "], [". Источник: ", ". Source: "],
    ["Веток от вводов: ", "Supply branches: "], ["Выбрано модулей: ", "Selected modules: "],
    ["Скопировано ", "Copied "], [" модулей", " modules"], [" выбрано", " selected"], [" мод.", " modules"],
    ["Характеристика ", "Curve "], ["Проверьте значение: ", "Check value: "], ["Проверьте диапазон: ", "Check range: "],
    [" · точки [А, мин. с, макс. с]", " · points [A, min. s, max. s]"],
    ["Ожидаемый ток по заданной петле L–PE: ", "Estimated current for the L–PE loop: "],
    ["Время по кривой при пусковом токе: ", "Curve time at starting current: "],
    ["Время по кривой при токе замыкания: ", "Curve time at fault current: "],
    ["Накопленная доля ресурса до срабатывания по модели остывания: ", "Accumulated trip dose in the cooling model: "],
    ["Для TT произведение RA × IΔn: ", "TT product RA × IΔn: "],
    ["Типовой профиль: медь, ", "Reference profile: copper, "], [" мм²", " mm²"],
    [" А. На 100 м при номинальном токе и PF = 1: падение ", " A. At 100 m, rated current and PF = 1: drop "],
    [" Вт. Для 3 фаз предполагается равномерная нагрузка. Допустимое падение проверяют по всей цепи.", " W. Three-phase load is assumed balanced. Check allowable drop over the entire circuit."],
    ["Оценка установившейся температуры: ", "Estimated steady-state temperature: "],
    ["По пути от ввода: ", "Along the supply path: "], [" В фазного напряжения на конце, потери ", " V end phase voltage; losses "],
    ["Падение на участке ", "Line voltage drop "], ["Падение напряжения ", "Voltage drop "], ["% выше предела ", "% exceeds the limit of "],
    [" При текущей нагрузке допустимая длина участка около ", " At the current load, maximum line length is approximately "],
    ["Ток ", "Current "], [" А выше допустимых ", " A exceeds the permitted "], [" А для линии.", " A for this line."],
    ["Потери ", "Losses "], [" Вт выше номинальной мощности линии ", " W exceed rated line power "], ["%), потери ", "%), losses "],
    [" Требуется ", " Required "], ["; подано ", "; supplied "], ["Нагрузка ", "Load "],
    ["Импортировано модулей: ", "Imported modules: "], ["Импорт модулей: ", "Module import: "],
    ["Открыть папку данных: ", "Open data folder: "], ["Ошибка: ", "Error: "],
    ["Сечение, мм², для ", "Cross-section, mm², for "],
    ["Воспроизвести GIF: ", "Play GIF: "], ["Остановить GIF: ", "Stop GIF: "], ["Увеличить изображение: ", "Enlarge image: "],
    ["Включено автоматов: ", "Breakers switched on: "], ["Отключено автоматов: ", "Breakers switched off: "],
    ["Вводной автомат ", "Main breaker "], ["Автомат порта ", "Port breaker "],
    ["Удалить шаблон «", "Delete template “"], ["» из каталога?", "” from the catalog?"],
    ["Ошибка импорта: ", "Import error: "], ["Из-за падения напряжения доступно ", "Voltage drop limits available power to "], [" кВт при нагрузке ", " kW for a load of "],
    ["По нормативу ΔU < ", "Voltage drop ΔU < "],
    ["Лист ", "Sheet "], ["Ветка №", "Branch #"], ["Версия ", "Version "], [" не поддерживается", " is not supported"],
    [": неверное число", ": invalid number"], [": неверная строка", ": invalid string"], ["Неверное поле разъёма: ", "Invalid connector field: "],
    ["Параметр защиты: ", "Protection parameter: "], ["Связь: ", "Connection: "],
  ];
  const phrasePattern = new RegExp("(^|[^А-Яа-яЁёA-Za-z])(" + [...dictionary.keys()].filter(key => key.length >= 3).sort((a,b) => b.length-a.length).map(key => key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")(?=$|[^А-Яа-яЁёA-Za-z])", "g");
  const translationCache = new Map();
  let language = root.electricDesktop?.info?.language === "en" ? "en" : "ru";
  function translate(source) {
    if (language !== "en" || typeof source !== "string") return source;
    if (!/[А-Яа-яЁё]/.test(source)) return source;
    if (translationCache.has(source)) return translationCache.get(source);
    const normalized = source.trim().replace(/\s+/g, " ");
    if (dictionary.has(normalized)) return source.replace(source.trim(), dictionary.get(normalized));
    const quoted = [];
    let value = source.replace(/«([^»]*)»/g, (_, name) => "«\uFFF0" + (quoted.push(name) - 1) + "\uFFF1»");
    for (const [from, to] of fragments) value = value.split(from).join(to);
    value = value.replace(phrasePattern, (_, prefix, phrase) => prefix + dictionary.get(phrase));
    value = value.replace(/МВт/g, "MW").replace(/кВт/g, "kW").replace(/Вт/g, "W").replace(/ΔUл/g, "ΔUline").replace(/ΔUф/g, "ΔUphase")
      .replace(/(\d)ф(?=\s|\b|$)/g, "$1-phase").replace(/([\d\s])А(?=[\s.,/]|$)/g, "$1A")
      .replace(/([\d\s])В(?=[\s.,(]|$)/g, "$1V").replace(/([\d\s])м(?=[\s.,·]|$)/g, "$1m")
      .replace(/ ветв\./g, " branches").replace(/ вых\./g, " outputs").replace(/\/ф/g, "/phase")
      .replace(/\uFFF0(\d+)\uFFF1/g, (_, index) => quoted[Number(index)]);
    if (translationCache.size > 2000) translationCache.clear();
    translationCache.set(source, value);
    return value;
  }
  const records = new WeakMap(), attributes = new WeakMap(), helpRecords = new WeakMap();
  const sourceTitle = document.title;
  const excluded = "script,style,textarea,[data-no-translate],#projectPill,#desktopDataPath,#actionLogEntries,#moduleNavigator option:not([value='']),.outlinerNode,.customCatalogRow .name,.overloadSourceLink";
  const attributeNames = ["title", "aria-label", "placeholder", "alt"];
  let observer;
  function textNode(node) {
    if (!node.parentElement || node.parentElement.closest(excluded) || node.parentElement.closest("[data-help-translated]")) return;
    let record = records.get(node);
    if (!record || node.data !== record.output) record = { source: node.data };
    record.output = translate(record.source);
    records.set(node, record);
    if (node.data !== record.output) node.data = record.output;
  }
  function element(node) {
    if (node.matches?.(excluded) || node.closest?.("[data-no-translate]")) return;
    let record = attributes.get(node) || {};
    for (const name of attributeNames) {
      const source = node.getAttribute(name);
      if (source === null) continue;
      if (!record[name] || source !== record[name].output) record[name] = { source };
      record[name].output = translate(record[name].source);
      const userPrefix = name === "placeholder" ? node.dataset.i18nUserPrefix : null;
      if (userPrefix && record[name].source.startsWith(userPrefix))
        record[name].output = userPrefix + translate(record[name].source.slice(userPrefix.length));
      if (language === "en" && name === "alt" && node.closest(".helpGuide") && /[А-Яа-яЁё]/.test(record[name].output))
        record[name].output = node.closest("figure")?.querySelector("figcaption")?.textContent || record[name].output;
      if (source !== record[name].output) node.setAttribute(name, record[name].output);
    }
    attributes.set(node, record);
  }
  function help() {
    for (const node of document.querySelectorAll(".helpGuide h2,.helpGuide h3,.helpGuide h4,.helpGuide p,.helpGuide li,.helpGuide figcaption")) {
      if (node.querySelector("h2,h3,h4,p,li")) continue;
      let record = helpRecords.get(node);
      if (!record) {
        const source = node.innerHTML.trim();
        const translated = root.ElectricHelpEnglish?.[source];
        if (!translated) continue;
        record = { source, translated }; helpRecords.set(node, record);
        node.dataset.helpTranslated = "true";
      }
      const next = language === "en" ? record.translated : record.source;
      if (node.innerHTML !== next) node.innerHTML = next;
    }
  }
  function scan(target = document.body) {
    if (!target) return;
    observer?.disconnect();
    if (target.nodeType === 3) textNode(target);
    else {
      if (target.nodeType === 1) element(target);
      const walker = document.createTreeWalker(target, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) walker.currentNode.nodeType === 3 ? textNode(walker.currentNode) : element(walker.currentNode);
    }
    observer?.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: attributeNames });
  }
  function setLanguage(next) {
    language = (typeof next === "string" ? next : next?.language) === "en" ? "en" : "ru";
    document.documentElement.lang = language;
    document.title = translate(sourceTitle);
    observer?.disconnect(); help(); scan();
    root.dispatchEvent(new CustomEvent("electric-language-changed", { detail: { language } }));
  }
  function cloneSource(source) {
    const clone=source.cloneNode(true);
    function restore(original,copy) {
      const helpRecord=helpRecords.get(original);
      if(helpRecord){copy.innerHTML=helpRecord.source;copy.removeAttribute("data-help-translated");return;}
      if(original.nodeType===3){const record=records.get(original);if(record)copy.data=record.source;return;}
      for(let i=0;i<original.childNodes.length;i++)restore(original.childNodes[i],copy.childNodes[i]);
    }
    restore(source,clone);
    return clone;
  }
  root.ElectricI18n = { t: translate, setLanguage, get language() { return language; }, scan, cloneSource, refreshHelp(){help();scan();} };
  function boot() {
    help(); scan(); document.documentElement.lang = language; document.title = translate(sourceTitle);
    observer = new MutationObserver(changes => {
      const targets = new Set();
      for (const change of changes) {
        if (change.type === "childList") for (const node of change.addedNodes) targets.add(node);
        else targets.add(change.target);
      }
      for (const target of targets) if (target.isConnected) scan(target);
    });
    observer.observe(document.body, { subtree:true, childList:true, characterData:true, attributes:true, attributeFilter:attributeNames });
    root.electricDesktop?.onLanguageChanged?.(setLanguage);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true }); else boot();
})(window);
