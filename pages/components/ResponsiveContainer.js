// components/ResponsiveContainer.js
import React from 'react';

const ResponsiveContainer = ({ children, className = '' }) => {
  return (
    <div className={`chat-container px-4 md:px-6 ${className}`}>
      {children}
    </div>
  );
};

export default ResponsiveContainer;