import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';
import { address } from '../../utils/ipAddress'; // Adjust the import path as necessary
interface User {
  _id: any;
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
    canManageSettings: boolean;
    canManageRecycle: boolean
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
    recyclebin: boolean,
    settingsPage: boolean,
    helpsupport: boolean,
  };
  };
}

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  isLoading: boolean;
}

axios.interceptors.request.use((config) => {
  const savedUser = localStorage.getItem("user");
  if (savedUser) {
    const parsedUser = JSON.parse(savedUser);
    config.headers.userid = parsedUser.id;
  }
  return config;
});

// already existing response interceptor:
axios.interceptors.response.use(
  (response) => response,
  (error) => {
    const url = error?.config?.url || "";

    // ❌ Do NOT redirect when login fails (invalid email/password)
    if (url.includes("/api/auth/login")) {
      return Promise.reject(error);
    }

    // ✅ Redirect only when session expired
    if (error.response?.status === 401) {
      localStorage.removeItem("user");
      window.location.href = "/login";
    }

    return Promise.reject(error);
  }
);

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

  useEffect(() => {
  if (!user) return;

  const interval = setInterval(async () => {
    try {
      await axios.get(`${address}/api/auth/me/${user.id}`);
    } catch (err: any) {
      if (err.response?.status === 401) {
        localStorage.removeItem("user");
        window.location.href = "/login";
      }
    }
  }, 5000); // every 5 seconds

  return () => clearInterval(interval);
}, [user]);

useEffect(() => {
  if (!user) return;
  axios.post(`${address}/api/users/${user.id}/access`).catch(() => {});
}, [user]);

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