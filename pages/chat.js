// pages/chat.js
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { FiSend, FiLoader } from 'react-icons/fi';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import { getServerSession } from 'next-auth/next';
import { authOptions } from './api/auth/[...nextauth]';
import ChatMessage from './components/ChatMessage';
import DateSeparator from './components/DateSeparator';
import NotificationMessage from './components/NotificationMessage';
import ResponsiveContainer from './components/ResponsiveContainer';
import ProcessingCardStack from './components/ProcessingCardStack';

const Chat = () => {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const chatAreaRef = useRef(null);
  const currentBotMessageIdRef = useRef(null);
  const eventSourceRef = useRef(null);
  const [isFirstMessageSent, setIsFirstMessageSent] = useState(false);
  const [processingSteps, setProcessingSteps] = useState([]);
  // Track completed processing steps for persistence (use localStorage to persist across page refreshes)
  const [completedProcessingSets, setCompletedProcessingSets] = useState([]);
  
  // Load completed processing sets from localStorage on initial render
  useEffect(() => {
    try {
      const savedSets = localStorage.getItem('completedProcessingSets');
      if (savedSets) {
        setCompletedProcessingSets(JSON.parse(savedSets));
      }
    } catch (error) {
      console.error('Error loading completed processing sets from localStorage:', error);
    }
  }, []);
  
  // Save completed processing sets to localStorage whenever they change
  useEffect(() => {
    try {
      if (completedProcessingSets.length > 0) {
        localStorage.setItem('completedProcessingSets', JSON.stringify(completedProcessingSets));
      }
    } catch (error) {
      console.error('Error saving completed processing sets to localStorage:', error);
    }
  }, [completedProcessingSets]);

  // --- Authentication Handling ---
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/');
    }
  }, [status, router]);

  // Function to add a notification message
  const addNotification = (text, icon = "🔔") => {
    const notification = {
      id: `notification-${Date.now()}`,
      text: text,
      type: 'notification',
      icon: icon,
      date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    };
    setMessages(prev => [...prev, notification]);
  };

  // Function to handle processing steps from the AI
  const handleProcessingStep = (stepData) => {
    if (!stepData || !stepData.content) return;
    let content = stepData.content.trim();
    let stepName = content.split(':')[0].trim();
    let isCompletionStep = true; // Always mark as complete, no loading state
    
    // Enhanced logic to handle duplicate steps and prevent incorrect steps
    // Check if we already have a completed step with this name
    const existingCompletedStep = processingSteps.find(step => 
      step.text.split(':')[0].trim() === stepName && 
      step.status === 'complete'
    );
    
    // Skip if we already have a completed step with this name
    if (existingCompletedStep) return;
    
    // Skip "Analyzing Request" step entirely - we're removing this step
    if (stepName === "Analyzing Request") return;
    // Removed the unreliable keyword check for "Fetching Calendar Data". We filter later.

    setProcessingSteps(prevSteps => {
      const existingStepIndex = prevSteps.findIndex(step =>
        step.text.split(':')[0].trim() === stepName
      );

      let updatedSteps;
      if (existingStepIndex >= 0) {
        // Update existing step, but DO NOT revert 'complete' status
        updatedSteps = [...prevSteps];
        const existingStep = updatedSteps[existingStepIndex];
        // Only update if the status is not already 'complete' or if this is a completion step
        if (existingStep.status !== 'complete' || isCompletionStep) {
          updatedSteps[existingStepIndex] = {
            ...existingStep, // Preserve other potential properties
            text: content,
            status: isCompletionStep ? 'complete' : 'loading'
          };
        }
      } else {
        // Add new step while preserving completed steps
        // This ensures we don't lose completed steps when adding new ones
        // Keep all existing steps and add the new one
        // This prevents steps from being reset when new ones appear
        updatedSteps = [...prevSteps, {
          text: content,
          status: isCompletionStep ? 'complete' : 'loading'
        }];
      }
      // Sort steps to ensure they appear in the correct order
      return updatedSteps.sort((a, b) => {
        const aName = a.text.split(':')[0].trim();
        const bName = b.text.split(':')[0].trim();
        const order = { 'Analyzing': 1, 'Fetching': 2, 'Generating': 3 };
        const aOrder = Object.keys(order).find(key => aName.includes(key)) ? order[Object.keys(order).find(key => aName.includes(key))] : 99;
        const bOrder = Object.keys(order).find(key => bName.includes(key)) ? order[Object.keys(order).find(key => bName.includes(key))] : 99;
        return aOrder - bOrder;
      });
    });
  };

  // Clear processing steps (might be needed for future logic, keeping it)
  const clearProcessingSteps = () => {
    setProcessingSteps([]);
  };

  // --- Cleanup EventSource on Unmount ---
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        console.log("Closing EventSource on component unmount.");
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, []);

  // --- Auto-Scroll Chat Area ---
  useEffect(() => {
    if (chatAreaRef.current) {
      setTimeout(() => {
         if (chatAreaRef.current) {
             chatAreaRef.current.scrollTop = chatAreaRef.current.scrollHeight;
         }
      }, 50);
    }
  }, [messages, processingSteps]); // Also trigger scroll when processing steps appear/change

  // Group messages by date
  const groupMessagesByDate = (messages) => {
    const groupedMessages = [];
    let currentDate = null;

    messages.forEach(message => {
        // Ensure message has a date property before comparing
        const messageDate = message.date || new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

      if (messageDate !== currentDate) {
        groupedMessages.push({
          id: `date-${messageDate}`,
          type: 'date',
          date: messageDate
        });
        currentDate = messageDate;
      }
      groupedMessages.push(message);
    });

    return groupedMessages;
  };

  // --- Core Message Sending & Streaming Logic ---
  const sendMessage = useCallback(async () => {
    const trimmedInput = input.trim();
    if (!trimmedInput || isLoading) return;

    setError(null);
    setIsLoading(true);
    setInput('');
    // Clear processing steps for the new message
    setProcessingSteps([]);

    // 1. Add User Message Optimistically
    const userMessage = {
      id: `user-${Date.now()}`,
      text: trimmedInput,
      sender: 'user',
      type: 'user',
      name: session?.user?.name || 'You', // Use session name or fallback
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    };
    setMessages(prev => [...prev, userMessage]);

    // 2. Prepare for Bot Response (Placeholder)
    const tempBotId = `bot-${Date.now()}`;
    currentBotMessageIdRef.current = tempBotId; // Track the ID of the upcoming bot message
    const placeholderBotMessage = {
      id: tempBotId,
      text: '',
      sender: 'bot',
      isStreaming: true, // Will be true initially
      isProcessing: true, // Starts in processing state until content arrives
      name: 'Athena',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      type: 'bot',
    };
    // Add the placeholder immediately so the processing cards have a message to appear before
    // Moved this line to after setting up the event source to prevent duplicates


    // 3. Initiate Server-Sent Events (SSE) Connection
    try {  
       if (eventSourceRef.current) {
            eventSourceRef.current.close();
       }

      const encodedMessage = encodeURIComponent(trimmedInput);
      let eventSourceUrl = `/api/chat-stream?message=${encodedMessage}&t=${Date.now()}`;
      if (!isFirstMessageSent) {
        eventSourceUrl += '&startNew=true';
        setIsFirstMessageSent(true);
      }

      const eventSource = new EventSource(eventSourceUrl);
      eventSourceRef.current = eventSource;

      // Add the placeholder message and clear processing steps AFTER setting up the event source
      // This ensures we don't have race conditions with the event source
      setMessages(prev => [...prev, placeholderBotMessage]);

      eventSource.onopen = () => {
        console.log("SSE Connection Opened");
         // Update placeholder to reflect connection open, but still processing
         setMessages(prevMessages => {
            const targetMsgIndex = prevMessages.findIndex(msg => msg.id === currentBotMessageIdRef.current);
            if (targetMsgIndex !== -1) {
                const updatedMessages = [...prevMessages];
                updatedMessages[targetMsgIndex] = {
                    ...updatedMessages[targetMsgIndex],
                    isProcessing: true, // Explicitly keep processing true
                    isStreaming: true,
                };
                return updatedMessages;
            }
            return prevMessages;
         });
      };

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          setMessages(prevMessages => {
            const targetMsgIndex = prevMessages.findIndex(msg => msg.id === currentBotMessageIdRef.current);

            if (targetMsgIndex === -1) {
              console.warn(`Could not find message with ID: ${currentBotMessageIdRef.current} to update.`);
              return prevMessages; // Return previous state if message not found
            }

            const updatedMessages = [...prevMessages]; // Create a mutable copy
            const currentMsg = updatedMessages[targetMsgIndex];

            switch (data.type) {
              case 'content':
                 // First content chunk arrives, stop showing 'processing' state for the message itself
                 // but keep isStreaming true.
                updatedMessages[targetMsgIndex] = {
                  ...currentMsg,
                  text: currentMsg.text + data.content,
                  isStreaming: true,
                  isProcessing: false, // Content is arriving, no longer just processing
                };
                 // No need to update processingSteps here, handled by 'processing' type
                break; // Ensure we don't fall through

                case 'events':
                  // Handle event data from the backend
                  console.log('DEBUG EVENT CARDS: Received events message:', data);
                  updatedMessages[targetMsgIndex] = {
                    ...currentMsg,
                    text: data.content || currentMsg.text,
                    events: data.events, // Store the events data
                    type: 'events', // Set the message type to 'events'
                    isStreaming: false,
                    isProcessing: false,
                  };
                  console.log('DEBUG EVENT CARDS: Updated message with events:', updatedMessages[targetMsgIndex]);
                  break; // Ensure we don't fall through

              case 'processing':
                 console.log("Processing:", data.content);
                 handleProcessingStep(data);
                 // Update the message state to ensure isProcessing is true if it wasn't
                 updatedMessages[targetMsgIndex] = {
                   ...currentMsg,
                   isProcessing: true, // Ensure processing flag is true while steps are active
                   isStreaming: true, // Still streaming contextually
                 };
                 break; // Ensure we don't fall through

              case 'end':
                console.log("Stream ended.");
                if (eventSourceRef.current) { // Close only if ref exists
                    eventSourceRef.current.close();
                    eventSourceRef.current = null;
                }
                
                // Capture the current steps for storage
                const finalSteps = processingSteps.map(step => ({
                    ...step,
                    status: 'complete',
                    text: step.text.includes('✓')
                      ? step.text
                      : (step.text.split(':')[0] + ': ✓').trim() // Add checkmark if missing
                }));
                // Update the state for rendering
                setProcessingSteps(finalSteps);
                
                // Update the final message state
                updatedMessages[targetMsgIndex] = {
                  ...currentMsg,
                  // text might be empty if only processing steps occurred and then end
                  text: currentMsg.text || "", // Ensure text isn't null/undefined
                  isStreaming: false,
                  isProcessing: false,
                };
                setIsLoading(false);
                // Don't clear currentBotMessageIdRef yet, keep it for potential final rendering check
                // currentBotMessageIdRef.current = null; // Clear only when *absolutely* done
                
                // Store the completed processing steps for persistence
                // Use the current processingSteps value instead of prevSteps
                setCompletedProcessingSets(prev => {
                  // Always store steps, even if empty, to ensure persistence
                  if (!currentBotMessageIdRef.current) return prev; // Only check for valid message ID
                  
                  // Check if we already have an entry for this message
                  const existingIndex = prev.findIndex(set => set.id === currentBotMessageIdRef.current);
                  
                  // For conversational queries, we've already filtered out steps in the backend
                  // Just store what we have at this point
                  
                  // If we already have an entry, update it
                  if (existingIndex >= 0) {
                    return [
                      ...prev.slice(0, existingIndex),
                      { id: currentBotMessageIdRef.current, steps: finalSteps },
                      ...prev.slice(existingIndex + 1)
                    ];
                  } else {
                    // Otherwise add a new entry
                    return [...prev, { id: currentBotMessageIdRef.current, steps: finalSteps }];
                  }
                });
                
                break; // Ensure we don't fall through

              case 'error':
                console.error("Stream error:", data.content);
                 if (eventSourceRef.current) { // Close only if ref exists
                     eventSourceRef.current.close();
                     eventSourceRef.current = null;
                 }

                // Mark all steps as complete on error
                const errorFinalSteps = processingSteps.map(step => ({
                    ...step,
                    status: 'complete', // Mark as complete even if error occurred after
                    text: step.text.includes('✓')
                      ? step.text
                      : (step.text.split(':')[0] + ': ✓').trim()
                }));
                // Update the state for rendering
                 setProcessingSteps(errorFinalSteps);

                 updatedMessages[targetMsgIndex] = {
                   ...currentMsg,
                   text: (currentMsg.text || '') + `\n\n⚠️ Error: ${data.content || 'An unknown error occurred.'}`,
                   isStreaming: false,
                   isProcessing: false,
                 };
                setError(data.content || 'An error occurred during the response.');
                setIsLoading(false);
                
                // Store the completed processing steps even on error, using current processingSteps
                setCompletedProcessingSets(prev => {
                  // Always store steps, even if empty, to ensure persistence
                  if (!currentBotMessageIdRef.current) return prev; // Only check for valid message ID
                  
                  // Check if we already have an entry for this message
                  const existingIndex = prev.findIndex(set => set.id === currentBotMessageIdRef.current);
                  
                  // Use the same pattern as the success case for consistency
                  return existingIndex >= 0
                    ? [...prev.slice(0, existingIndex), { id: currentBotMessageIdRef.current, steps: errorFinalSteps }, ...prev.slice(existingIndex + 1)]
                    : [...prev, { id: currentBotMessageIdRef.current, steps: errorFinalSteps }];
                });

                break; // Ensure we don't fall through

               case 'start':
                   console.log("Stream started by server.");
                   // Ensure the message state reflects processing start
                   updatedMessages[targetMsgIndex] = {
                     ...currentMsg,
                     isProcessing: true,
                     isStreaming: true,
                   };
                   break; // Ensure we don't fall through

              default:
                console.warn("Received unknown message type:", data.type);
            }

            // IMPORTANT: Return the updated array to trigger state change
            return updatedMessages;
          });

        } catch (parseError) {
          console.error("Error parsing SSE data:", event.data, parseError);
           // Update the bot message with a parsing error indicator
           setMessages(prev => prev.map(msg =>
               msg.id === currentBotMessageIdRef.current
                   ? { ...msg, text: msg.text + "\n\n⚠️ Error parsing response.", isStreaming: false, isProcessing: false }
                   : msg
           ));
            setIsLoading(false); // Stop loading on parse error too
             if (eventSourceRef.current) {
                 eventSourceRef.current.close();
                 eventSourceRef.current = null;
             }
        }
      };

      eventSource.onerror = (err) => {
        console.error('SSE Connection Error:', err);
        if (eventSourceRef.current) {
             eventSourceRef.current.close();
             eventSourceRef.current = null;
        }
        setError("Connection error. Please check your network and try again.");

        setMessages(prev => prev.map(msg =>
            msg.id === currentBotMessageIdRef.current
                ? { ...msg, text: (msg.text || '') + "\n\n⚠️ Connection failed.", isStreaming: false, isProcessing: false }
                : msg
        ));
        setIsLoading(false);
        setProcessingSteps([]); // Clear steps on connection error
        // Don't clear completedProcessingSets to maintain persistence
        // currentBotMessageIdRef.current = null; // Keep ref until render cycle potentially finishes
      };

    } catch (fetchError) {
      console.error('Error initiating SSE connection:', fetchError);
      setError("Failed to start the chat connection.");
      // Remove the placeholder bot message if initiation failed completely
      setMessages(prev => prev.filter(msg => msg.id !== tempBotId));
      setIsLoading(false);
      currentBotMessageIdRef.current = null; // Clear ref on init error
      setProcessingSteps([]); // Clear steps
      // Don't clear completedProcessingSets to maintain persistence
    }
  }, [input, isLoading, isFirstMessageSent, session?.user?.name]); // Dependencies updated

  // --- Input Handling ---
  const handleInputChange = (e) => {
    setInput(e.target.value);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // --- Feature Card Click ---
   const handleCardClick = (prompt) => {
    setInput(prompt);
  }

  // --- Render Logic ---
  if (status === 'loading') {
    return (
      <div className="flex justify-center items-center min-h-screen bg-white text-gray-600">
        <FiLoader className="animate-spin text-2xl mr-3" /> Loading...
      </div>
    );
  }

  // Redirect handled by useEffect, show message while redirecting
  if (status === 'unauthenticated') {
    return (
       <div className="flex justify-center items-center min-h-screen bg-white text-gray-600">
         Redirecting to login...
       </div>
     );
  }

  // Process messages to add date separators
  const processedMessages = groupMessagesByDate(messages);

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Main Content Area */}
      <main className="flex-grow overflow-y-auto scrollbar-thin" ref={chatAreaRef}>
        <ResponsiveContainer className="py-4">
          {/* Chat Messages */}
          {processedMessages.map((msg, index) => {
             // Check if *this* message is the bot message currently being processed/streamed
             const isTargetBotMessage = msg.id === currentBotMessageIdRef.current;
             // Find completed processing steps for this message (with fallback to empty array)
             const completedStepsForMessage = completedProcessingSets.find(set => set.id === msg.id)?.steps || [];
             
             // Always show processing steps after bot messages if they exist
             // This ensures they stay visible in the chat
             const showProcessingStepsAfterThis = msg.sender === 'bot' && (
               // Either show active steps for current message or completed steps for any message
               (isTargetBotMessage && isLoading && processingSteps.length > 0) || 
               // Or show completed steps for any bot message (only if there are steps)
               (completedStepsForMessage && completedStepsForMessage.length > 0)
             );

            return (
              // Use message ID as key for stable identity, fallback for date separators
              <React.Fragment key={msg.id || `fragment-${index}`}>
                
                {/* Show processing cards BEFORE the message content so they appear above the response */}
                {showProcessingStepsAfterThis && (
                  <ProcessingCardStack
                    processingSteps={isTargetBotMessage && isLoading ? processingSteps : completedStepsForMessage}
                    isPersistent={!isTargetBotMessage || !isLoading}
                    className="mt-2 mb-4 animate-fadeIn" // Add margin above and below the stack
                  />
                )}
                {/* Render the actual message component */}
                {(() => { // Use an IIFE for clean conditional rendering logic
                  if (msg.type === 'date') {
                    return <DateSeparator key={msg.id} date={msg.date} />;
                  } else if (msg.type === 'notification') {
                    return <NotificationMessage key={msg.id} text={msg.text} icon={msg.icon || "🔔"} />;
                  } else {
                    // Pass the message object to ChatMessage
                    // ChatMessage can internally handle its appearance based on isStreaming, isProcessing etc.
                    return <ChatMessage key={msg.id} message={msg} />;
                  }
                })()}
              </React.Fragment>
            );
          })}

          {/* Display Global Error (if not loading) */}
          {error && !isLoading && (
            <div className="flex justify-center py-4">
              <div className="p-3 rounded-md bg-red-100 text-red-700 text-sm border border-red-200 max-w-md text-center">
                {error}
              </div>
            </div>
          )}
        </ResponsiveContainer>
      </main>

      {/* Input Footer */}
      <footer className="flex-shrink-0 p-3 md:p-4 bg-white border-t border-gray-200 z-10">
        <ResponsiveContainer>
          <div className="relative">
            <input
              type="text"
              placeholder="Ask Athena about your calendar..." // More specific placeholder
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              disabled={isLoading} // Disable input while loading/streaming
              className="w-full bg-white border border-gray-300 rounded-full py-3 pl-4 pr-12 text-gray-700 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-60 transition-all"
              aria-label="Chat input"
            />
            <button
              onClick={sendMessage}
              disabled={isLoading || !input.trim()} // Disable button if loading or input empty
              className={`absolute right-2 top-1/2 transform -translate-y-1/2 p-2 rounded-full text-white transition-all duration-200 ease-in-out ${
                isLoading || !input.trim()
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
              aria-label="Send message"
            >
              {isLoading ? (
                <FiLoader className="animate-spin h-5 w-5" />
              ) : (
                <FiSend className="h-5 w-5" />
              )}
            </button>
          </div>
        </ResponsiveContainer>
      </footer>
    </div>
  );
};

export default Chat;

// Keep getServerSideProps for authentication check
export async function getServerSideProps(context) {
    const session = await getServerSession(context.req, context.res, authOptions);

    if (!session || session.error === "RefreshAccessTokenError") {
        console.log("Redirecting: No session or refresh error.", session?.error);
        return {
            redirect: {
                destination: session?.error === "RefreshAccessTokenError" ? '/api/auth/signin' : '/', // Go to signin on refresh error
                permanent: false,
            },
        };
    }

    return {
        props: {
            // session: session // Pass session if needed, but useSession is preferred client-side
        },
    };
}