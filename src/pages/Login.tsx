import React, { useState } from "react";
import { Navigate, Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { Mail, Lock, Eye, EyeOff } from "lucide-react";

const Login: React.FC = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const { user, login } = useAuth();

  if (user) return <Navigate to="/dashboard" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    const success = await login(email.trim().toLowerCase(), password);
    if (!success) setError("Invalid email or password");

    setIsLoading(false);
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center px-4">
      <div
        className="
          w-full max-w-7xl bg-white rounded-3xl shadow-[0_30px_80px_-30px_rgba(0,0,0,0.25)]
          overflow-hidden grid grid-cols-1 lg:grid-cols-[40%_60%]
          h-[600px] md:h-[680px] lg:h-[750px]
        "
      >
        {/* LEFT IMAGE */}
        <div className="relative hidden lg:block">
          <img
            src="https://images.unsplash.com/photo-1522071820081-009f0129c71c"
            alt="Team collaboration"
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/30 to-transparent" />
          <div className="relative z-10 h-full flex flex-col justify-end p-10 text-white">
            <h3 className="text-sm font-semibold tracking-widest opacity-90">
              TMS – TASK MANAGEMENT SYSTEM
            </h3>
            <p className="mt-3 text-xl font-medium leading-snug max-w-sm">
              Organize tasks, manage revisions, and streamline team productivity.
            </p>
          </div>
        </div>

        {/* RIGHT LOGIN */}
        <div className="flex items-center justify-center px-6 sm:px-10 py-12">
          <div className="w-full max-w-md">

            {/* HEADER */}
            <div className="mb-8">
              <h1 className="text-2xl font-bold text-gray-900">
                TMS – Task Management System
              </h1>
              
              <p className="text-gray-500 mt-2">
                Welcome back 👋 Sign in to continue.
              </p>
            </div>

            {/* FORM */}
            <div className="bg-gray-50 rounded-2xl border border-gray-200 p-8 shadow-sm">
              <form onSubmit={handleSubmit} className="space-y-5">

                {/* EMAIL */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email address
                  </label>
                  <div className="relative">
                    <Mail size={18} className="absolute left-3 top-3.5 text-gray-400" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@company.com"
                      className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-300 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/20 outline-none transition"
                    />
                  </div>
                </div>

                {/* PASSWORD */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Password
                  </label>
                  <div className="relative">
                    <Lock size={18} className="absolute left-3 top-3.5 text-gray-400" />
                    <input
                      type={showPassword ? "text" : "password"}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pl-10 pr-10 py-3 rounded-xl border border-gray-300 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/20 outline-none transition"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-3.5 text-gray-400 hover:text-indigo-600"
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                {/* ERROR */}
                {error && (
                  <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-600">
                    {error}
                  </div>
                )}

                {/* SUBMIT */}
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-3 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition disabled:opacity-50 shadow-md shadow-indigo-600/25"
                >
                  {isLoading ? "Signing in…" : "Sign in"}
                </button>
              </form>
            </div>

            {/* LEGAL LINKS */}
            <div className="text-center mt-6 text-sm text-gray-500">
              By continuing, you agree to our{" "}
              <Link
                to="/terms-and-conditions"
                className="text-indigo-600 hover:underline font-medium"
              >
                Terms & Conditions
              </Link>{" "}
              and{" "}
              <Link
                to="/privacy-policy"
                className="text-indigo-600 hover:underline font-medium"
              >
                Privacy Policy
              </Link>.
            </div>
            

            {/* FOOTER */}
            <div className="mt-6 text-center text-xs text-gray-500 space-y-2">
              <p className="text-gray-500 font-semibold mt-2 text-sm">
                Powered by Finamite Solutions LLP
              </p>
              <p>© {new Date().getFullYear()} Finamite Solutions LLP. All rights reserved.</p>
              <p>
                Support:{" "}
                <span className="font-semibold text-gray-700">
                  +91 99886 00362
                </span>
              </p>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
