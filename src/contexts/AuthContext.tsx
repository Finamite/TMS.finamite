import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';
import { address } from '../../utils/ipAddress'; // Adjust the import path as necessary
interface User {
  id: string;
  companyId?: string;
  username: string;
  email: string;
  role: string;
  permissions: {
    canViewTasks: boolean;
    canViewAllTeamTasks: boolean;
    canAssignTasks: boolean;
    canDeleteTasks: boolean;
    canEditTasks: boolean;
    canManageUsers: boolean;
    canEditRecurringTaskSchedules: boolean;
  };
  company?: {
    companyId: string;
    companyName: string;
    limits: {
      adminLimit: number;
      managerLimit: number;
      userLimit: number;
    };
    permissions: {
    dashboard: boolean;
    pendingTasks: boolean;
    pendingRecurringTasks: boolean;
    masterTasks: boolean;
    masterRecurringTasks: boolean;
    performance: boolean;
    assignTask: boolean;
    adminPanel: boolean;
    chat: boolean;
  };
  };
}

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const savedUser = localStorage.getItem('user');
    if (savedUser) {
      setUser(JSON.parse(savedUser));
    }
    setIsLoading(false);
  }, []);

  const login = async (username: string, password: string): Promise<boolean> => {
    try {
      const response = await axios.post(`${address}/api/auth/login`, {
        email: username,
        password
      });

      if (response.data.user) {
        setUser(response.data.user);
        localStorage.setItem('user', JSON.stringify(response.data.user));
        return true;
      }
      return false;
    } catch (error) {
      console.error('Login error:', error);
      return false;
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('user');
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
};