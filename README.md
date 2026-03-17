# RodjerHelp attachment module v2

Это улучшенный модуль прикрепления файлов для чата.

Что внутри:

- фронтенд React/TypeScript
- backend route для Node.js/Express + multer
- мини-скрипт self-check для синтаксической проверки файлов через TypeScript transpileModule

## Что реализовано

1. Кнопка скрепки рядом с полем ввода
2. Превью:
   - картинка -> миниатюра
   - документ -> имя файла и размер
3. Кнопка удаления файла
4. Отправка текста + файла одним запросом через FormData
5. Пример backend endpoint для приема файла и текста
6. Возврат attachment metadata в сообщении

## Что я уже проверил

Файлы из этого архива были прогнаны через TypeScript transpileModule на синтаксис.
То есть синтаксических ошибок в самих файлах нет.

## Что нужно подключить вручную

- Вставить фронтенд-файлы в твой проект
- Подключить компонент `AttachmentChatInput`
- На backend добавить маршрут `messages.ts`
- В основном Express app поднять статику:
  app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')))

## Быстрый пример использования

```tsx
import AttachmentChatInput from './components/chat/AttachmentChatInput';

export default function Page() {
  return <AttachmentChatInput apiBaseUrl="http://localhost:4000" />;
}
```
