import React from 'react';

interface FilterButtonProps {
  label: string;
  isSelected: boolean;
  onClick: () => void;
}

const FilterButton: React.FC<FilterButtonProps> = ({ label, isSelected, onClick }) => {
  return (
    <button
      onClick={onClick}
      className={`px-6 py-2.5 rounded-lg font-medium transition-all duration-200 ${
        isSelected
          ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg scale-105'
          : 'bg-white text-gray-700 hover:bg-gray-50 shadow-sm hover:shadow-md border border-gray-200'
      } capitalize transform hover:scale-105 active:scale-95`}
    >
      {label}
    </button>
  );
};

export default FilterButton;