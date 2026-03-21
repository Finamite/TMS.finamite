import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';

const Layout: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen min-w-0 overflow-hidden" style={{ backgroundColor: 'var(--color-background)' }}>
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 flex min-w-0 flex-col overflow-hidden transition-all duration-300 ease-out">
        <Header onMenuClick={() => setSidebarOpen(true)} />
        <main
          className="flex-1 min-w-0 overflow-x-hidden overflow-y-auto transition-all duration-300 ease-out"
          style={{ backgroundColor: 'var(--color-surface)' }}
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default Layout;
