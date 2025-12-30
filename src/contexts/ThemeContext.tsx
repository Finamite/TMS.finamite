import React, { createContext, useContext, useState, useEffect } from 'react';

interface ThemeContextType {
  theme: string;
  setTheme: (theme: string) => void;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

const themes = {
  light: {
    name: 'Light',
    colors: {
      primary: '#3a2ee2ff',
      secondary: '#00A3FF',
      accent: '#FF6B35',
      success: '#00C851',
      warning: '#FFB900',
      error: '#FF4444',
      info: '#33B5E5',
      background: '#FFFFFF',
      surface: '#FFFFFF',
      text: '#2D3748',
      textSecondary: '#718096',
      border: '#E2E8F0',
      chat: '#e8f2fdff',
      surfacechat: '#f6f6fcff',
      settingcolor: '#efeff3ff',
      surfacehelp:'#f6f6fcff',
      cardcolor: '#efeff3ff',

    }
  },
  dark: {
    name: 'Dark',
    colors: {
      primary: '#74acecff',
      secondary: '#66B3FF',
      accent: '#FF8A65',
      success: '#4CAF50',
      warning: '#FFC107',
      error: '#F44336',
      info: '#2196F3',
      background: '#1A202C',
      surface: '#2D3748',
      text: '#F7FAFC',
      textSecondary: '#A0AEC0',
      border: '#4A5568',
      chat: '#2e4261ff',
      surfacechat: '#2D3748',
      settingcolor: '#626e81ff',
      surfacehelp:'#2e4261ff',
      cardcolor: '#2D3748',
    }
  },
};

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState('light');

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') || 'light';
    setThemeState(savedTheme);
    applyTheme(savedTheme);
  }, []);

  const setTheme = (newTheme: string) => {
    setThemeState(newTheme);
    localStorage.setItem('theme', newTheme);
    applyTheme(newTheme);
  };

  const applyTheme = (themeName: string) => {
    const themeConfig = themes[themeName as keyof typeof themes] || themes.light;
    const root = document.documentElement;

    Object.entries(themeConfig.colors).forEach(([key, value]) => {
      root.style.setProperty(`--color-${key}`, value);
    });

    // Apply dark class for better Tailwind integration
    if (themeName === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  const isDark = theme === 'dark';

  return (
    <ThemeContext.Provider value={{ theme, setTheme, isDark }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const availableThemes = Object.keys(themes);
export const themeNames = Object.fromEntries(
  Object.entries(themes).map(([key, value]) => [key, value.name])
);