// components/ProcessingCard.js
import React from 'react';
import { FiCheck, FiLoader, FiClock, FiCalendar, FiCloud, FiSettings, FiTool } from 'react-icons/fi';

const ProcessingCard = ({ text, status, index, isPersistent = false }) => {
  // Always treat as complete, regardless of passed status
  
  // Split text into label and value parts if it contains a colon
  const [label, value] = text.includes(':') ? [text.split(':')[0], text.split(':').slice(1).join(':')] : [text, ''];

  // Determine the type of operation for specialized styling
  const getOperationType = () => {
    const lowerLabel = label.toLowerCase();
    if (lowerLabel.includes('calendar') || lowerLabel.includes('event')) {
      return 'calendar';
    } else if (lowerLabel.includes('weather')) {
      return 'weather';
    } else if (lowerLabel.includes('preference') || lowerLabel.includes('setting')) {
      return 'preference';
    } else if (lowerLabel.includes('analyzing')) {
      return 'analyzing';
    } else if (lowerLabel.includes('generating')) {
      return 'generating';
    } else {
      return 'other';
    }
  };
  
  const operationType = getOperationType();
  
  const getStatusIcon = () => {
    // Always show checkmark with appropriate color based on operation type
    return (
      <FiCheck className={`transition-all duration-300 ${
        operationType === 'calendar' ? 'text-blue-500' :
        operationType === 'weather' ? 'text-yellow-500' :
        operationType === 'preference' ? 'text-purple-500' :
        operationType === 'analyzing' ? 'text-gray-600' :
        operationType === 'generating' ? 'text-green-600' :
        'text-green-500'
      }`} />
    );
  };

  // Determine text color based on status
  const textColorClass = status === 'complete' 
    ? 'text-gray-800 font-medium' 
    : status === 'loading' 
      ? 'text-gray-700' 
      : 'text-gray-500';

  // Calculate stacking effect based on index
  const stackingStyle = {
    marginTop: index > 0 ? `-${index * 5}px` : '0',
    zIndex: 50 - index, // Higher cards have higher z-index
    opacity: 1 - (index * 0.05), // Slight opacity decrease for stacked cards
  };

  // Get background color based on operation type
  const getBgColorClass = () => {
    // Always use the complete style
    
    switch (operationType) {
      case 'calendar':
        return 'bg-blue-50 bg-opacity-30 border-blue-50';
      case 'weather':
        return 'bg-yellow-50 bg-opacity-30 border-yellow-50';
      case 'preference':
        return 'bg-purple-50 bg-opacity-30 border-purple-50';
      case 'analyzing':
        return 'bg-gray-50 bg-opacity-30 border-gray-50';
      case 'generating':
        return 'bg-green-50 bg-opacity-30 border-green-50';
      default:
        return 'bg-green-50 bg-opacity-30 border-green-50';
    }
  };

  // Animation classes based on status
  // Always use fadeIn animation for non-persistent cards
  const animationClass = !isPersistent ? 'animate-fadeIn' : '';
      
  // Additional classes for persistent cards
  const persistentClass = isPersistent && status === 'complete' 
    ? 'opacity-90' // Slightly reduce opacity for persistent cards
    : '';
    
  // Get progress bar color based on operation type
  const getProgressBarColorClass = () => {
    switch (operationType) {
      case 'calendar':
        return 'bg-blue-500';
      case 'weather':
        return 'bg-yellow-500';
      case 'preference':
        return 'bg-purple-500';
      case 'analyzing':
        return 'bg-gray-600';
      case 'generating':
        return 'bg-green-600';
      default:
        return 'bg-blue-500';
    }
  };

  return (
    <div 
      className={`w-full transition-all duration-300 ease-in-out ${animationClass} ${persistentClass}`}
      style={stackingStyle}
    >
      <div className={`bg-white border ${getBgColorClass()} 
        rounded-md py-2 px-4 mx-auto max-w-2xl shadow-sm transition-all duration-300 
        ${isPersistent ? 'hover:shadow-md' : ''}`}>
        <div className="flex items-center">
          <div className="flex-shrink-0 mr-3 w-5 h-5 flex items-center justify-center">
            {getStatusIcon()}
          </div>
          <div className={`flex-grow ${textColorClass} transition-all duration-300`}>
            <span className="font-medium">{label}</span>
            {value && <span>{value}</span>}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProcessingCard;