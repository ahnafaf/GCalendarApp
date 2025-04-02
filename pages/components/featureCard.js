// components/FeatureCard.js
import React from 'react';

const FeatureCard = ({ icon: Icon, title, description, onClick }) => {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center justify-start text-center bg-[#444654] p-6 rounded-lg border border-gray-700 hover:border-gray-600 transition-all duration-300 transform hover:-translate-y-1 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 w-full h-full"
      aria-label={`Learn more about ${title}`}
    >
      <div className="text-blue-400 mb-4 text-3xl p-3 bg-[#343541] rounded-full">
        <Icon />
      </div>
      <h3 className="text-lg font-semibold text-gray-100 mb-3">{title}</h3>
      <p className="text-sm text-gray-400 leading-relaxed opacity-90">{description}</p>
    </button>
  );
};

export default FeatureCard;
