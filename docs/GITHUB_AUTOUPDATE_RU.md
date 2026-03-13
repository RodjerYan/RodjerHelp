# Автообновление RodjerHelp через GitHub Releases

## Что уже настроено в проекте

- Electron-приложение проверяет обновления автоматически после запуска собранной версии.
- В разделе **Настройки → О программе** появилась кнопка **Проверить обновления**.
- Если новая версия найдена, приложение предложит скачать её.
- После скачивания приложение предложит перезапуск и установку.
- GitHub Actions workflow `github-release-windows.yml` собирает Windows-релиз и загружает в GitHub Release файлы:
  - `RodjerHelp-<version>-win-x64.exe`
  - `latest.yml`
  - `*.blockmap`

## Как выпускать обновление

1. Измени версию в `apps/desktop/package.json`.
2. Сделай commit.
3. Создай тег вида `vX.Y.Z`, где версия тега совпадает с `apps/desktop/package.json`.
4. Отправь commit и тег на GitHub.
5. GitHub Actions соберёт Windows-релиз и загрузит файлы в GitHub Release.
6. Уже установленное приложение увидит новую версию и предложит обновиться.

## Рекомендуемые настройки GitHub

- Репозиторий лучше держать **public**, чтобы встроенный GitHub provider у `electron-updater` мог читать `latest.yml` и файлы релиза без дополнительной авторизации.
- Ветка по умолчанию: `main`.
- Releases: включены.
- Actions: включены.

## Что должно совпадать

- `apps/desktop/package.json` → `version`
- Git tag → `v<version>`

Пример:

- `version`: `0.3.9`
- тег: `v0.3.9`

## Быстрый сценарий релиза

```powershell
cd C:\Yandex.Disk\Project\RodjerHelp

git add .
git commit -m "chore: release 0.3.9"
git tag v0.3.9
git push origin main
git push origin v0.3.9
```

После этого workflow сам соберёт релиз и опубликует артефакты.
