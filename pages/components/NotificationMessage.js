// components/NotificationMessage.js
import React from 'react';

const NotificationMessage = ({ text, icon = "🔔" }) => {
  // Use a bell icon for all notification messages to match the design
  const displayIcon = "🔔";
  
  return (
    <div className="flex justify-center my-3 px-4">
      <div className="bg-gray-50 rounded-md py-3 px-4 text-sm text-gray-700 border border-gray-100 w-full max-w-2xl">
        <div className="flex items-center">
          <span className="mr-2">{displayIcon}</span>
          {text}
        </div>
      </div>
    </div>
  );
};

export default NotificationMessage;