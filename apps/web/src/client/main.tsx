import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { initTheme } from './lib/theme';
import { initI18n } from './i18n';
import { router } from './router';
import './styles/globals.css';

initTheme();

const container = document.getElementById('root');
if (!container) {
  throw new Error('Корневой элемент не найден');
}

const root = createRoot(container);

initI18n().then(() => {
  root.render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  );
});
