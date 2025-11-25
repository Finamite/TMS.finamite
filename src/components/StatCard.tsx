import React from 'react';
import { DivideIcon as LucideIcon } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: typeof LucideIcon;
  change?: string;
  changeType?: 'increase' | 'decrease' | 'neutral';
  gradient: string;
}

const StatCard: React.FC<StatCardProps> = ({ 
  title, 
  value, 
  icon: Icon, 
  change, 
  changeType = 'neutral',
  gradient 
}) => {
  return (
    <div className={`relative overflow-hidden rounded-xl bg-gradient-to-r ${gradient} p-6 text-white shadow-lg transition-all duration-300 hover:shadow-xl hover:scale-105`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium opacity-90">{title}</p>
          <p className="text-3xl font-bold mt-2">{value}</p>
          {change && (
            <div className={`flex items-center mt-2 text-sm ${
              changeType === 'increase' ? 'text-green-200' : 
              changeType === 'decrease' ? 'text-red-200' : 'text-white/70'
            }`}>
              <span>{change}</span>
            </div>
          )}
        </div>
        <div className="opacity-20">
          <Icon size={48} />
        </div>
      </div>
      <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -translate-y-8 translate-x-8"></div>
    </div>
  );
};

export default StatCard;