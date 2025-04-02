// components/DateSeparator.js
import React from 'react';

const DateSeparator = ({ date }) => {
  return (
    <div className="flex justify-center my-4 px-4">
      <div className="bg-gray-100 rounded-full py-1 px-4 text-xs text-gray-600 font-medium">
        {date}
      </div>
    </div>
  );
};

export default DateSeparator;