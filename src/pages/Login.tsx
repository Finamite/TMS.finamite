import React, { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { LogIn, Mail, Lock, Eye, EyeOff } from 'lucide-react';

const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const { user, login } = useAuth();
  const [showPassword, setShowPassword] = useState(false);

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    const success = await login(email, password);

    if (!success) {
      setError('Invalid email or password');
    }

    setIsLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--color-background)' }}>
      <div className="max-w-md w-full mx-4">
        <div className="rounded-2xl shadow-xl border p-8 flex flex-col justify-between"
          style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
        >
          <div>
            <div className="text-center mb-8">
              <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: 'var(--color-primary)' }}>
                <LogIn size={32} color="white" />
              </div>
              <h2 className="text-3xl font-bold" style={{ color: 'var(--color-text)' }}>
                Welcome Back
              </h2>
              <p className="mt-2" style={{ color: 'var(--color-textSecondary)' }}>
                Sign in to your account
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text)' }}>
                  Email
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Mail size={20} style={{ color: 'var(--color-textSecondary)' }} />
                  </div>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full pl-10 pr-4 py-3 border rounded-lg focus:ring-2 focus:border-transparent transition-colors"
                    style={{
                      backgroundColor: 'var(--color-background)',
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-text)'
                    }}
                    placeholder="Enter your email"
                  />
                </div>
              </div>

              <div>
                 <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text)' }}>
    Password
  </label>
  <div className="relative">
    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
      <Lock size={20} style={{ color: 'var(--color-textSecondary)' }} />
    </div>
    <input
      type={showPassword ? "text" : "password"}
      value={password}
      onChange={(e) => setPassword(e.target.value)}
      required
      className="w-full pl-10 pr-10 py-3 border rounded-lg focus:ring-2 focus:border-transparent transition-colors"
      style={{
        backgroundColor: 'var(--color-background)',
        borderColor: 'var(--color-border)',
        color: 'var(--color-text)'
      }}
      placeholder="Enter your password"
    />
    <button
      type="button"
      onClick={() => setShowPassword(!showPassword)}
      className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-500 hover:text-gray-700"
      tabIndex={-1} // prevents focusing when tabbing
    >
      {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
    </button>
  </div>
</div>

              {error && (
                <div className="text-sm text-center p-3 rounded-lg"
                  style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', color: 'var(--color-error)' }}
                >
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 px-4 rounded-lg font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ backgroundColor: 'var(--color-primary)', color: 'white' }}
              >
                {isLoading ? 'Signing In...' : 'Sign In'}
              </button>
            </form>
          </div>

          {/* Footer / Copyright */}
          <div className="mt-8 text-center text-sm space-y-1">
            <p style={{ color: 'var(--color-textSecondary)' }}>
              © Finamite Solutions. All rights reserved.
            </p>
            <p style={{ color: 'var(--color-textSecondary)' }}>
              For any queries and help call us on <br />
              <span style={{ color: 'var(--color-text)', fontWeight: 500 }}>
              +91 99886 00362
              </span>
            </p>
          </div>

        </div>
      </div>
    </div>
  );
};

export default Login;