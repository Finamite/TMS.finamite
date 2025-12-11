import React from 'react';

interface AnimatedCardProps {
  children: React.ReactNode;
  className?: string;
  variant?: 'default' | 'glass' | 'elevated' | 'gradient' | 'neon';
  hover?: boolean;
  delay?: number;
}

export const AnimatedCard: React.FC<AnimatedCardProps> = ({ 
  children, 
  className = "", 
  variant = "default", 
  hover = true,
  delay = 0
}) => {
  const baseClasses = "relative transition-all duration-500 ease-out transform";
  
  const variants = {
    default: "bg-white/90 backdrop-blur-sm border border-gray-200/50 shadow-lg rounded-2xl",
    glass: "bg-white/10 backdrop-blur-xl border border-white/20 shadow-2xl rounded-2xl",
    elevated: "bg-white shadow-2xl rounded-2xl border border-gray-100",
    gradient: "bg-gradient-to-br from-blue-50 to-indigo-100 border border-blue-200/50 shadow-xl rounded-2xl",
    neon: "bg-gray-900/90 backdrop-blur-sm border border-cyan-500/30 shadow-lg shadow-cyan-500/20 rounded-2xl"
  };

  const hoverClasses = hover 
    ? "hover:scale-105 hover:shadow-2xl hover:-translate-y-2 hover:rotate-1" 
    : "";

  const animationStyle = {
    animationDelay: `${delay}ms`,
    animation: 'fadeInUp 0.8s ease-out forwards'
  };

  return (
    <div 
      className={`${baseClasses} ${variants[variant]} ${hoverClasses} ${className} opacity-0`}
      style={animationStyle}
    >
      {children}
    </div>
  );
};