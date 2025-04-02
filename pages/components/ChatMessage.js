// components/ChatMessage.js
import React from 'react';
import { FiLoader } from 'react-icons/fi';
import EventCard from './EventCard';
import { formatEventForCard, formatEventsForCards } from '../utils/eventCardUtils';

const renderText = (text) => {
  if (!text) return null;
  
  const lines = text.split('\n');
  return lines.map((line, index) => {
    return (
      <div key={`line-${index}`} className="leading-relaxed">
        {line || ' '}
      </div>
    );
  });
};

// Function to extract event data from text
const extractEventsFromText = (text) => {
  if (!text) return null;

  // Check if this is a message about a newly created event
  const isNewEvent = text.toLowerCase().includes('event added') || 
                     text.toLowerCase().includes('created a new event') || 
                     text.toLowerCase().includes('successfully added') ||
                     text.toLowerCase().includes('event has been created');
  
  // Special case for newly created events
  if (isNewEvent) {
    // Try to extract the event title
    const titleRegex = /event added: "([^"]+)"/i;
    const titleMatch = text.match(titleRegex);
    const title = titleMatch ? titleMatch[1] : 'New Event';
    
    // Try to extract the event ID
    const idRegex = /\(ID:\s*([a-zA-Z0-9_-]+)\)/;
    const idMatch = text.match(idRegex);
    const eventId = idMatch ? idMatch[1] : '';
    const eventUrl = eventId ? `https://calendar.google.com/calendar/event?eid=${eventId}` : '';
    
    // Try to extract the start time
    const startingRegex = /starting\s+([^.]+)/i;
    const startingMatch = text.match(startingRegex);
    const startTime = startingMatch ? startingMatch[1] : 'Scheduled';
    
    // Get today's date
    const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    
    return [{
      title,
      startDate: today,
      startTime,
      endTime: '',
      location: '',
      description: '',
      isNew: true,
      eventUrl
    }];
  }
  
  // Try to extract events from numbered list format with bold titles
  // This pattern looks for numbered items with bold titles followed by details
  const eventRegex = /(\d+)\.\s+\*\*([^*]+)\*\*\s+([\s\S]*?)(?=\d+\.\s+\*\*|$)/g;
  let matches = [...text.matchAll(eventRegex)];
  
  // If we found matches, check if the last match contains the assistant's message
  if (matches.length > 0) {
    const lastMatch = matches[matches.length - 1];
    const lastMatchContent = lastMatch[3];
    
    // Check if the last match contains a sentence that looks like an assistant's message
    const assistantMessageRegex = /(If you need|Let me know|Feel free|Would you like|Do you need|Is there anything)/i;
    if (assistantMessageRegex.test(lastMatchContent)) {
      // Find where the assistant's message starts
      const assistantMessageMatch = lastMatchContent.match(assistantMessageRegex);
      if (assistantMessageMatch) {
        const messageStartIndex = lastMatchContent.indexOf(assistantMessageMatch[0]);
        if (messageStartIndex > 0) {
          // Split the content at the message start
          const eventContent = lastMatchContent.substring(0, messageStartIndex).trim();
          
          // Update the last match with just the event content
          const updatedLastMatch = [
            lastMatch[0],
            lastMatch[1],
            lastMatch[2],
            eventContent
          ];
          
          // Replace the last match in the matches array
          matches[matches.length - 1] = updatedLastMatch;
        }
      }
    }
  }
  
  // Try to extract event ID for URL
  const eventIdRegex = /\(ID:\s*([a-zA-Z0-9_-]+)\)/;
  const eventIdMatch = text.match(eventIdRegex);
  const eventId = eventIdMatch ? eventIdMatch[1] : '';
  const eventUrl = eventId ? `https://calendar.google.com/calendar/event?eid=${eventId}` : '';
  
  if (matches.length > 0) {
    // Parse each event match into an event object
    const events = matches.map(match => {
      const [_, number, title, details] = match;
      
      // Extract time using regex
      const timeRegex = /\*\*Time:\*\*\s+(.*?)(?=\n|$)/i;
      const timeMatch = details.match(timeRegex);
      let startTime = null;
      let endTime = '';
      
      if (timeMatch) {
        const timeText = timeMatch[1].trim();
        if (timeText.includes('-')) {
          [startTime, endTime] = timeText.split('-').map(t => t.trim());
        } else {
          startTime = timeText;
        }
      }
      
      // Extract location using regex
      const locationRegex = /\*\*Location:\*\*\s+(.*?)(?=\n|$)/i;
      const locationMatch = details.match(locationRegex);
      const location = locationMatch ? locationMatch[1].trim() : '';
      
      // Extract description (anything not matched by other patterns)
      let description = '';
      if (!timeMatch && !locationMatch && details.trim()) {
        description = details.trim();
      }
      
      // Get today's date
      const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const formattedDate = today;
      
      // Create the event object
      return {
        title,
        startDate: formattedDate,
        startTime: startTime || 'All Day',
        endTime,
        location,
        description,
        isNew: isNewEvent
      };
    });
    
    console.log('DEBUG EVENT CARDS: Extracted events:', events);
    return events;
  }
  
  return null;
};

const ChatMessage = ({ message, showAvatar = true }) => {
  const { text, sender, isStreaming, isProcessing, type, timestamp, name, events } = message;

  // Debug logging for event cards
  if (type === 'event' || type === 'events') {
    console.log('DEBUG EVENT CARDS: Rendering message with type:', type);
    console.log('DEBUG EVENT CARDS: Events data:', events);
  }

  const isUser = sender === 'user';
  
  // For Airbnb style, we use message bubbles with alignment
  const alignment = isUser ? 'justify-end' : 'justify-start';
  const bubbleColor = isUser ? 'bg-blue-50 text-gray-800' : 'bg-white text-gray-800'; 
  const bubbleBorder = isUser ? 'border border-blue-100' : 'border border-gray-200'; 
  const bubbleMaxWidth = 'max-w-[85%] sm:max-w-[75%] md:max-w-[70%]';
  const avatarLetter = name ? name.charAt(0).toUpperCase() : isUser ? 'U' : 'A';
  const avatarColor = isUser ? 'bg-blue-600' : 'bg-gray-700';

  // Special rendering for notification/status messages
  if (type === 'notification') {
    return (
      <div className="flex justify-center my-3 px-4">
        <div className="bg-gray-50 rounded-md py-3 px-4 text-sm text-gray-700 border border-gray-200 w-full max-w-2xl">
          <div className="flex items-center">
            <span className="mr-2">🔔</span>
            {text}
          </div>
        </div>
      </div>
    );
  }
  
  if (type === 'error') {
    return (
      <div className="flex justify-center my-3">
        <div className="p-4 rounded-md bg-red-100 text-red-700 text-sm border border-red-200 max-w-md text-center">
          {text}
        </div>
      </div>
    );
  }
  
  if (type === 'loading') {
    return (
      <div className="w-full py-3 px-4">
        <div className="max-w-2xl mx-auto flex items-center">
          <FiLoader className="animate-spin text-gray-400 text-lg mr-3" />
          <span className="text-sm text-gray-500">{text || 'Thinking...'}</span>
        </div>
      </div>
    );
  }

  // Check if the message contains calendar event information
  const extractedEvents = extractEventsFromText(text);
  if (extractedEvents && extractedEvents.length > 0 && !isUser) {
    return (
      <div className="w-full py-3 px-4">
        <div className="max-w-2xl mx-auto space-y-4">
          {extractedEvents.map((event, index) => (
            <EventCard 
              key={index} 
              {...event} 
              eventUrl={event.eventUrl || (text.includes('ID:') ? `https://calendar.google.com/calendar/event?eid=${text.match(/ID:​?([a-zA-Z0-9_-]+)/)?.[1] || ''}` : '')}
            />
          ))}
        </div>
      </div>
    );
  }

  // Special rendering for event cards
  if (type === 'event' || type === 'events') {
    // If events array is provided directly, use it
    const formattedEvents = Array.isArray(events) 
      ? formatEventsForCards(events) 
      : [];
    
    if (formattedEvents.length > 0) {
      return (
      <div className="w-full py-3 px-4">
        <div className="max-w-2xl mx-auto">
          <div className={`flex ${alignment} items-end mb-1`}>
            {!isUser && showAvatar && (
              <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 mr-2 mb-1">
                <div className={`w-full h-full ${avatarColor} flex items-center justify-center text-white font-medium`}>
                  {avatarLetter}
                </div>
              </div>
            )}
            
            <div className={bubbleMaxWidth}>
              {name && !isUser && showAvatar && (
                <div className="text-sm font-medium text-gray-800 mb-1 ml-1">
                  {name}
                </div>
              )}
              
              <div className="space-y-4">
                {formattedEvents.map((event, index) => (
                  <EventCard
                    key={index}
                    title={event.title}
                    startDate={event.startDate}
                    startTime={event.startTime}
                    endTime={event.endTime}
                    location={event.location}
                    description={event.description}
                  />
                ))} 
              </div>
              
              {timestamp && (
                <div className="text-xs text-gray-500 mt-1 ml-1 md:mt-2">
                  {timestamp}
                </div>
              )}
            </div>
            
            {isUser && showAvatar && (
              <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 ml-2 mb-1">
                <div className={`w-full h-full ${avatarColor} flex items-center justify-center text-white font-medium`}>
                  {avatarLetter}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      );
    } else {
      return (
        // Fallback to regular text rendering if no events could be parsed
        <div className="w-full py-3 px-4">
          <div className="max-w-2xl mx-auto">
            <div className={`flex ${alignment} items-end mb-1`}>
              {!isUser && showAvatar && (
                <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 mr-2 mb-1">
                  <div className={`w-full h-full ${avatarColor} flex items-center justify-center text-white font-medium`}>
                    {avatarLetter}
                  </div>
                </div>
              )}
              
              <div className={bubbleMaxWidth}>
                {name && !isUser && showAvatar && (
                  <div className="text-sm font-medium text-gray-800 mb-1 ml-1">
                    {name}
                  </div>
                )}
                
                <div className={`${bubbleColor} ${bubbleBorder} rounded-2xl px-3 py-2 md:px-4 md:py-3 shadow-sm`}>
                  <div className="whitespace-pre-wrap break-words text-sm md:text-base relative leading-relaxed">
                    {text ? renderText(text) : "No event data available"}
                  </div>
                </div>
                
                {timestamp && (
                  <div className="text-xs text-gray-500 mt-1 ml-1 md:mt-2">
                    {timestamp}
                  </div>
                )}
              </div>
              
              {isUser && showAvatar && (
                <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 ml-2 mb-1">
                  <div className={`w-full h-full ${avatarColor} flex items-center justify-center text-white font-medium`}>
                    {avatarLetter}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }
  }

  return (
    <div className="w-full py-3 px-4">
      <div className="max-w-2xl mx-auto">
        <div className={`flex ${alignment} items-end mb-1`}>
          {!isUser && showAvatar && (
            <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 mr-2 mb-1">
              <div className={`w-full h-full ${avatarColor} flex items-center justify-center text-white font-medium`}>
                {avatarLetter}
              </div>
            </div>
          )}
          
          <div className={bubbleMaxWidth}>
            {name && !isUser && showAvatar && (
              <div className="text-sm font-medium text-gray-800 mb-1 ml-1">
                {name}
              </div>
            )}
            
            <div className={`${bubbleColor} ${bubbleBorder} rounded-2xl px-3 py-2 md:px-4 md:py-3 shadow-sm`}>
              <div className="whitespace-pre-wrap break-words text-sm md:text-base relative leading-relaxed">
                {renderText(text)}
                
                {isStreaming && !isProcessing && (
                  <span className="inline-block w-1.5 h-4 ml-1 bg-blue-400 opacity-90 animate-pulse align-middle"></span>
                )}
                
                {/* Only show the "Processing..." indicator briefly before the ProcessingCardStack appears */}
                {isProcessing && !text && (
                  <div className="inline-flex items-center text-xs text-gray-500 mt-1 animate-fadeIn">
                    <FiLoader className="animate-spin mr-1" /> Initializing...
                  </div>
                )}
              </div>
            </div>
            
            {timestamp && (
              <div className="text-xs text-gray-500 mt-1 ml-1 md:mt-2">
                {timestamp}
              </div>
            )}
          </div>
          
          {isUser && showAvatar && (
            <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 ml-2 mb-1">
              <div className={`w-full h-full ${avatarColor} flex items-center justify-center text-white font-medium`}>
                {avatarLetter}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChatMessage;