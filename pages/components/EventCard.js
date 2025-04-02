// components/EventCard.js
import React from 'react';
import { FiCalendar, FiMapPin } from 'react-icons/fi';
import { DateTime } from 'luxon';

const EventCard = ({
  title, 
  startDate, 
  startTime, 
  endTime, 
  location, 
  description,
  isNew = false,
  eventUrl = ''
}) => {
  // Use the startDate directly if it's already formatted
  // This handles cases where the date is already in the format "Apr 2"
  const formattedDate = startDate || 'Today';
  
  // Determine background color based on isNew flag
  const bgColor = isNew ? 'bg-green-50' : 'bg-white';
  const borderColor = isNew ? 'border-green-200' : 'border-gray-200';

  return (
    <div className={`${bgColor} rounded-3xl shadow-md p-6 max-w-sm w-full animate-scaleDown border ${borderColor}`}>
      <h2 className="text-2xl font-semibold text-gray-800 mb-4">
        {eventUrl ? (
          <a href={eventUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
            {title}
          </a>
        ) : (
          title
        )}
      </h2>
      
      <div className="flex items-start mb-3">
        <FiCalendar className="text-gray-600 mt-1 mr-3 flex-shrink-0" />
        <div>
          <div className="text-lg font-medium">{formattedDate || 'Today'}</div>
          <div className="text-gray-600">
            {startTime && endTime ? `${startTime} – ${endTime}` : startTime === 'All Day' ? 'All Day' : startTime}
          </div>
        </div>
      </div>
      
      {location && (
        <div className="flex items-start mb-4">
          <FiMapPin className="text-gray-600 mt-1 mr-3 flex-shrink-0" />
          <div className="text-gray-800">{location}</div>
        </div>
      )}
      
      {description && (
        <p className="text-gray-700 mt-4">{description}</p>
      )}
    </div>
  );
};

export default EventCard;