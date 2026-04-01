/**
 * Integration tests for Header component
 * Tests rendering and navigation elements
 * @module __tests__/integration/renderer/components/Header.integration.test
 * @vitest-environment jsdom
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import Header from '@/components/layout/Header';

function hasExactClass(element: Element, className: string): boolean {
  return element.className.split(' ').includes(className);
}

describe('Header Integration', () => {
  describe('rendering', () => {
    it('should render the header element', () => {
      // Arrange & Act
      render(
        <MemoryRouter initialEntries={['/']}>
          <Header />
        </MemoryRouter>,
      );

      // Assert
      const header = screen.getByRole('banner');
      expect(header).toBeInTheDocument();
    });

    it('should render the logo/brand link', () => {
      // Arrange & Act
      render(
        <MemoryRouter initialEntries={['/']}>
          <Header />
        </MemoryRouter>,
      );

      // Assert
      const brandLink = screen.getByRole('link', { name: /роджер хелп/i });
      expect(brandLink).toBeInTheDocument();
      expect(brandLink).toHaveAttribute('href', '/');
    });

    it('should render the brand text', () => {
      // Arrange & Act
      render(
        <MemoryRouter initialEntries={['/']}>
          <Header />
        </MemoryRouter>,
      );

      // Assert
      expect(screen.getByText('Роджер Хелп')).toBeInTheDocument();
    });
  });

  describe('navigation elements', () => {
    it('should render the navigation', () => {
      // Arrange & Act
      render(
        <MemoryRouter initialEntries={['/']}>
          <Header />
        </MemoryRouter>,
      );

      // Assert
      const nav = screen.getByRole('navigation');
      expect(nav).toBeInTheDocument();
    });

    it('should render Home navigation link', () => {
      // Arrange & Act
      render(
        <MemoryRouter initialEntries={['/']}>
          <Header />
        </MemoryRouter>,
      );

      // Assert
      const homeLink = screen.getByRole('link', { name: /^главная$/i });
      expect(homeLink).toBeInTheDocument();
      expect(homeLink).toHaveAttribute('href', '/');
    });

    it('should render History navigation link', () => {
      // Arrange & Act
      render(
        <MemoryRouter initialEntries={['/']}>
          <Header />
        </MemoryRouter>,
      );

      // Assert
      const historyLink = screen.getByRole('link', { name: /история/i });
      expect(historyLink).toBeInTheDocument();
      expect(historyLink).toHaveAttribute('href', '/history');
    });

    it('should render Settings navigation link', () => {
      // Arrange & Act
      render(
        <MemoryRouter initialEntries={['/']}>
          <Header />
        </MemoryRouter>,
      );

      // Assert
      const settingsLink = screen.getByRole('link', { name: /настройки/i });
      expect(settingsLink).toBeInTheDocument();
      expect(settingsLink).toHaveAttribute('href', '/settings');
    });

    it('should render all three navigation links', () => {
      // Arrange & Act
      render(
        <MemoryRouter initialEntries={['/']}>
          <Header />
        </MemoryRouter>,
      );

      // Assert
      const nav = screen.getByRole('navigation');
      const links = nav.querySelectorAll('a');
      expect(links).toHaveLength(3);
    });
  });

  describe('active state', () => {
    it('should mark Home link as active when on home route', () => {
      // Arrange & Act
      render(
        <MemoryRouter initialEntries={['/']}>
          <Header />
        </MemoryRouter>,
      );

      // Assert
      const homeLink = screen.getByRole('link', { name: /^главная$/i });
      expect(hasExactClass(homeLink, 'bg-white')).toBe(true);
    });

    it('should mark History link as active when on history route', () => {
      // Arrange & Act
      render(
        <MemoryRouter initialEntries={['/history']}>
          <Header />
        </MemoryRouter>,
      );

      // Assert
      const historyLink = screen.getByRole('link', { name: /история/i });
      expect(hasExactClass(historyLink, 'bg-white')).toBe(true);
    });

    it('should mark Settings link as active when on settings route', () => {
      // Arrange & Act
      render(
        <MemoryRouter initialEntries={['/settings']}>
          <Header />
        </MemoryRouter>,
      );

      // Assert
      const settingsLink = screen.getByRole('link', { name: /настройки/i });
      expect(hasExactClass(settingsLink, 'bg-white')).toBe(true);
    });

    it('should not mark Home link as active when on other routes', () => {
      // Arrange & Act
      render(
        <MemoryRouter initialEntries={['/history']}>
          <Header />
        </MemoryRouter>,
      );

      // Assert
      const homeLink = screen.getByRole('link', { name: /^главная$/i });
      expect(homeLink.className).toContain('text-muted-foreground');
    });

    it('should have nav link styles on all navigation links', () => {
      // Arrange & Act
      render(
        <MemoryRouter initialEntries={['/']}>
          <Header />
        </MemoryRouter>,
      );

      // Assert
      const homeLink = screen.getByRole('link', { name: /^главная$/i });
      const historyLink = screen.getByRole('link', { name: /история/i });
      const settingsLink = screen.getByRole('link', { name: /настройки/i });

      expect(homeLink.className).toContain('rounded-xl');
      expect(historyLink.className).toContain('rounded-xl');
      expect(settingsLink.className).toContain('rounded-xl');
    });
  });

  describe('layout and structure', () => {
    it('should have drag region class for window dragging', () => {
      // Arrange & Act
      render(
        <MemoryRouter initialEntries={['/']}>
          <Header />
        </MemoryRouter>,
      );

      // Assert
      const header = screen.getByRole('banner');
      expect(header.className).toContain('drag-region');
    });

    it('should have no-drag class on logo link', () => {
      // Arrange & Act
      render(
        <MemoryRouter initialEntries={['/']}>
          <Header />
        </MemoryRouter>,
      );

      // Assert
      const brandLink = screen.getByRole('link', { name: /роджер хелп/i });
      expect(brandLink.className).toContain('no-drag');
    });

    it('should have no-drag class on navigation', () => {
      // Arrange & Act
      render(
        <MemoryRouter initialEntries={['/']}>
          <Header />
        </MemoryRouter>,
      );

      // Assert
      const nav = screen.getByRole('navigation');
      expect(nav.className).toContain('no-drag');
    });

    it('should render logo icon SVG', () => {
      // Arrange & Act
      render(
        <MemoryRouter initialEntries={['/']}>
          <Header />
        </MemoryRouter>,
      );

      // Assert
      const brandLink = screen.getByRole('link', { name: /роджер хелп/i });
      const svg = brandLink.querySelector('svg');
      expect(svg).toBeInTheDocument();
    });
  });

  describe('deep routes', () => {
    it('should not highlight any nav link on execution routes', () => {
      // Arrange & Act
      render(
        <MemoryRouter initialEntries={['/execution/task-123']}>
          <Header />
        </MemoryRouter>,
      );

      // Assert - None of the standard routes should be active
      const homeLink = screen.getByRole('link', { name: /^главная$/i });
      const historyLink = screen.getByRole('link', { name: /история/i });
      const settingsLink = screen.getByRole('link', { name: /настройки/i });

      expect(hasExactClass(homeLink, 'bg-white')).toBe(false);
      expect(hasExactClass(historyLink, 'bg-white')).toBe(false);
      expect(hasExactClass(settingsLink, 'bg-white')).toBe(false);
    });
  });
});
