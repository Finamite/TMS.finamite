import React from 'react';

export const FloatingElements: React.FC = () => {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden">
      {/* Floating circles */}
      <div className="absolute top-20 left-10 w-32 h-32 bg-gradient-to-r from-blue-400/20 to-purple-400/20 rounded-full blur-xl animate-float"></div>
      <div className="absolute top-40 right-20 w-24 h-24 bg-gradient-to-r from-pink-400/20 to-red-400/20 rounded-full blur-xl animate-float-delayed"></div>
      <div className="absolute bottom-32 left-1/4 w-40 h-40 bg-gradient-to-r from-green-400/20 to-blue-400/20 rounded-full blur-xl animate-float-slow"></div>
      <div className="absolute bottom-20 right-1/3 w-28 h-28 bg-gradient-to-r from-yellow-400/20 to-orange-400/20 rounded-full blur-xl animate-float"></div>
      
      {/* Geometric shapes */}
      <div className="absolute top-1/3 left-1/2 w-16 h-16 bg-gradient-to-r from-indigo-400/10 to-purple-400/10 rotate-45 animate-spin-slow"></div>
      <div className="absolute bottom-1/3 right-10 w-12 h-12 bg-gradient-to-r from-cyan-400/10 to-blue-400/10 rotate-12 animate-pulse"></div>
    </div>
  );
};