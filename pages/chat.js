// pages/chat.js
import React, { useState, useRef, useEffect } from 'react';
// Example using react-icons
import { FiSend, FiMenu } from 'react-icons/fi';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import { getServerSession } from 'next-auth/next';
import { authOptions } from './api/auth/[...nextauth]';

const Chat = () => {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const chatBoxRef = useRef(null);
  const currentBotMessageIdRef = useRef(null);
  const accumulatedTextRef = useRef(''); // Use a ref to track accumulated text across renders
  const [isFirstMessageSent, setIsFirstMessageSent] = useState(false);
  
  // Redirect to login page if not authenticated
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/');
    }
  }, [status, router]);

  // State for streaming response
  const [streamingResponse, setStreamingResponse] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  
  // Function for sending message to chatbot API
  const sendMessage = async () => {
    if (!input.trim()) return;

    const newUserMessage = { id: Date.now(), text: input, sender: 'user' };
    setMessages((prev) => [...prev, newUserMessage]);
    setInput('');
    setIsLoading(true);
    setError(null);
    setStreamingResponse(''); 
    setIsStreaming(true);
    accumulatedTextRef.current = ''; // Reset accumulated text

    try {
      // Create a temporary bot message for streaming
      const tempBotId = Date.now() + 1;
      setMessages((prev) => [...prev, {
        id: tempBotId,
        text: '',
        sender: 'bot',
        isStreaming: true
      }]);
      
      // Store the ID in the ref for later access
      currentBotMessageIdRef.current = tempBotId;
      console.log(`Created new bot message with ID: ${tempBotId}`);
      // Send the request to initiate streaming
      // Create a URL with the message as a query parameter for the POST request
      const encodedMessage = encodeURIComponent(input);
      
      // Create a proper URL for the EventSource that includes the message
      let eventSourceUrl = `/api/chat-stream?message=${encodedMessage}&t=${Date.now()}`;
      if (!isFirstMessageSent) {
        eventSourceUrl += '&startNew=true';
        setIsFirstMessageSent(true); // Mark that the first message has been sent
      }
      const eventSource = new EventSource(eventSourceUrl);
      let connectionTimeout = null;
      
      // Set a longer timeout to handle cases where the connection might hang
      connectionTimeout = setTimeout(() => {
        console.log("Connection timeout (30s) - closing EventSource");
        if (eventSource.readyState !== 2) { // 2 = CLOSED
          eventSource.close();
          
          // If we have accumulated text, use it
          if (accumulatedTextRef.current.length > 0) {
            console.log(`Using accumulated text (${accumulatedTextRef.current.length} chars) after timeout`);
            finalizeBotMessage(accumulatedTextRef.current);
          } else {
            setError("Connection timed out. Please try again.");
            setIsLoading(false);
            setIsStreaming(false);
          }
        }
      }, 30000); // 30 second timeout - give it more time
      
      // Set up event handlers
      eventSource.onmessage = (event) => {
        try {
          // Clear the timeout on any message
          if (connectionTimeout) {
            clearTimeout(connectionTimeout);
            connectionTimeout = setTimeout(() => {
              console.log("Message timeout (30s) - closing EventSource");
              eventSource.close();
              
              // If we have accumulated text, use it
              if (accumulatedTextRef.current.length > 0) {
                console.log(`Using accumulated text (${accumulatedTextRef.current.length} chars) after message timeout`);
                finalizeBotMessage(accumulatedTextRef.current);
              } else {
                setError("Response timed out. Please try again.");
                setIsLoading(false);
                setIsStreaming(false);
              }
            }, 30000); // Reset timeout to 30 seconds
          }
          
          let data;
          try {
            data = JSON.parse(event.data);
          } catch (parseError) {
            console.error("Error parsing event data:", event.data, parseError);
            return;
          }
          
          if (data.type === 'content' && data.content) {
            // Accumulate the streaming text
            accumulatedTextRef.current += data.content;
            
            // Restore incremental updates for better UX
            setStreamingResponse(accumulatedTextRef.current);
            
            // Update the message incrementally for visual feedback
            setMessages((prev) => {
              const updatedMessages = prev.map(msg =>
                msg.id === currentBotMessageIdRef.current
                  ? {
                      ...msg,
                      text: accumulatedTextRef.current,
                      hasEvents: accumulatedTextRef.current.includes('📅') || accumulatedTextRef.current.includes('📆')
                    }
                  : msg
              );
              return updatedMessages;
            });
          } else if (data.type === 'processing') {
            // Handle processing state - show a processing indicator
            console.log("Processing tool calls:", data.content);
            
            // Store the current accumulated text before processing
            const currentText = accumulatedTextRef.current;
            
            try {
              setMessages((prev) =>
                prev.map(msg => {
                  return (
                  msg.id === currentBotMessageIdRef.current
                    ? {
                        ...msg,
                        text: currentText + "\n\n⚙️ " + (data.content || "Processing..."),
                        isProcessing: true
                      }
                    : msg
                  );
                })
              );
            } catch (stateError) {
              console.error("Error updating message state for processing:", stateError);
            }
          } else if (data.type === 'end') {
            // Streaming completed
            // Finalize the bot message
            console.log(`End event received with accumulated text length: ${accumulatedTextRef.current.length}`);
            
            // If we have no accumulated text but we're getting an end event,
            // this might be after a tool call where the connection was reset
            if (accumulatedTextRef.current.length === 0) {
              console.log("End event received with no accumulated text - possible tool call issue");
              
              // Check if we have a pending message that's in processing state
              setMessages(prev => {
                const currentMsg = prev.find(m => m.id === currentBotMessageIdRef.current);
                if (currentMsg && currentMsg.isProcessing) {
                  console.log("Found message in processing state, keeping it visible");
                  return prev.map(m => 
                    m.id === currentBotMessageIdRef.current
                      ? {
                          ...m,
                          text: m.text || "Processing your request...",
                          isStreaming: false,
                          isProcessing: true // Keep processing indicator
                        }
                      : m
                  );
                }
                return prev;
              });
              
              // Don't close the connection yet, wait for more data
              console.log("Ignoring premature end event, waiting for more data");
              return;
            }
            
            
           // Clear any pending timeout
           if (connectionTimeout) {
              clearTimeout(connectionTimeout);
              connectionTimeout = null;
            }
            
            // Use our helper function to finalize the message
            finalizeBotMessage(accumulatedTextRef.current);
            
           // Close the connection
            eventSource.close();
          } else if (data.type === 'error') {
            throw new Error(data.content || 'Error in streaming response');
          }
        } catch (err) {
          console.error('Error parsing stream data:', err);
          eventSource.close();
          
          // Clear any pending timeout
          if (connectionTimeout) {
            clearTimeout(connectionTimeout);
            connectionTimeout = null;
         }
          
          setError("Oops! Something went wrong with the streaming response.");
          setIsLoading(false);
          setIsStreaming(false);
        }
      };
      
      eventSource.onerror = (err) => {
        console.error('EventSource error:', err);
        eventSource.close();
        
        // Clear any pending timeout
        if (connectionTimeout) {
          clearTimeout(connectionTimeout);
          connectionTimeout = null;
        }
        
        // If we have accumulated text, use it despite the error
        if (accumulatedTextRef.current.length > 0) {
          console.log(`Using accumulated text (${accumulatedTextRef.current.length} chars) after connection error`);
          finalizeBotMessage(accumulatedTextRef.current);
        } else {
          setError("Connection error. Please try again.");
          setIsLoading(false);
          setIsStreaming(false);
        }
      };
      
    } catch (error) {
      console.error('Error sending message:', error);
      setError("Oops! Something went wrong. Please try again.");
      setIsLoading(false);
      setIsStreaming(false);
    }
  };

  // Helper function to finalize the bot message with the accumulated text
  const finalizeBotMessage = (text) => {
    console.log(`Finalizing bot message with text length: ${text.length}`);
    
    // Store the text in a local variable to avoid closure issues
    const finalText = text;

    // Add a delay before finalizing to ensure all chunks are received
    setTimeout(() => {
      // If we have text, use it
      if (finalText && finalText.length > 0) {
        // Update the message with the final text
        try {
          setMessages(prev => 
            prev.map(msg => 
              msg.id === currentBotMessageIdRef.current 
                ? {
                    ...msg,
                    text: finalText,
                    isStreaming: false,
                    isProcessing: false,
                    hasEvents: finalText.includes('📅') || finalText.includes('📆')
                  }
                : msg
            )
          );
          console.log("Successfully updated message with final text");
        } catch (updateError) {
          console.error("Error updating message with final text:", updateError);
        }
      } else {
        // If we don't have text, show an error message
        try {
          setMessages(prev => 
            prev.map(msg => 
              msg.id === currentBotMessageIdRef.current 
                ? {
                    ...msg,
                    text: "No response received. Please try again.",
                    isStreaming: false,
                    isProcessing: false
                  }
                : msg
            )
          );
          console.log("Updated message with 'No response received'");
        } catch (errorUpdateError) {
          console.error("Error updating message with error text:", errorUpdateError);
        }
      }
      
      // Update state
      setIsLoading(false);
      setIsStreaming(false);
    }, 3000); // Add a 3-second delay before finalizing
  };

  const handleInputChange = (e) => {
    setInput(e.target.value);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (chatBoxRef.current) {
      chatBoxRef.current.scrollTop = chatBoxRef.current.scrollHeight;
    }
  }, [messages, isLoading, error]);


  // Show loading state while checking authentication
  if (status === 'loading') {
    return (
      <div className="flex justify-center items-center h-screen text-gray-600">
        Loading...
      </div>
    );
  }
  
  // If not authenticated, don't render anything (will redirect to login)
  if (status === 'unauthenticated') {
    return (
      <div className="flex justify-center items-center h-screen text-gray-600">
        Redirecting to login...
      </div>
    );
  }
  
  // Only render the chat UI if authenticated
  return (
    <div className="mt-5"> {/* Container for chat interface */}
      {/* Hamburger menu with profile picture and Google account name */}
      <div className="flex items-center mb-4 p-2 bg-white rounded-lg shadow-sm">
        <button className="text-gray-700 text-xl mr-3">
          <FiMenu />
        </button>
        <div className="flex items-center">
          {session?.user && (
            <>
              <img
                src={session.user.image}
                alt="Profile"
                className="w-8 h-8 rounded-full mr-2"
              />
              <span className="text-sm font-medium text-gray-700">
                {session.user.name}
              </span>
            </>
          )}
        </div>
      </div>
      {/* Styles previously from #chat-box */}
      <div
        ref={chatBoxRef}
        className="bg-gray-100 rounded-2xl p-5 max-h-[300px] min-h-[100px] overflow-y-auto mb-4 border border-gray-200" // Added border
      >
        {messages.length === 0 && !isLoading && !error && (
            <p className="text-center text-gray-500 text-sm">Ask me to manage your calendar events!</p>
        )}
        {messages.map((msg) => (
            // Styles previously from .message and specific types
            <div
                key={msg.id}
                className={`mb-3 p-3 rounded-xl max-w-[80%] break-words ${
                    msg.sender === 'user'
                    ? 'bg-blue-500 text-white ml-auto' // .user styles
                    : 'bg-gray-600 text-white mr-auto' // .bot styles 
                } ${msg.isStreaming ? 'border-l-4 border-yellow-400' : ''} ${msg.isProcessing ? 'border-l-4 border-blue-400' : ''}`}
            >
                {msg.hasEvents ? (
                    <div className="whitespace-pre-wrap">
                        {msg.text.split('\n').map((line, index) => (
                            <div key={index} className={`${
                                line.startsWith('📅') || line.startsWith('📆') ? 'font-bold' : ''
                            }`}>
                                {line}
                            </div>
                        ))}
                        {msg.isStreaming && (
                            <span className="inline-block w-2 h-4 ml-1 bg-yellow-400 animate-pulse"></span>
                        )}
                        {msg.isProcessing && (
                            <span className="inline-block w-2 h-4 ml-1 bg-blue-400 animate-pulse"></span>
                        )}
                    </div>
                ) : (
                    <div className="whitespace-pre-wrap">
                        {msg.text}
                        {msg.isStreaming && (
                            <span className="inline-block w-2 h-4 ml-1 bg-yellow-400 animate-pulse"></span>
                        )}
                        {msg.isProcessing && (
                            <span className="inline-block w-2 h-4 ml-1 bg-blue-400 animate-pulse"></span>
                        )}
                    </div>
                )}
            </div>
        ))}

         {/* Loading Indicator inside chatbox */}
        {isLoading && (
            // Styles previously from .loading and .dot
            <div className="flex justify-start items-center h-10 my-2">
                 <div className="flex space-x-1.5 p-2 bg-gray-600 rounded-full">
                    <span className="w-2 h-2 bg-white rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                    <span className="w-2 h-2 bg-white rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                    <span className="w-2 h-2 bg-white rounded-full animate-bounce"></span>
                 </div>
            </div>
        )}

        {/* Error message inside chatbox */}
        {error && (
             // Styles previously from .error
             <div className="mb-3 p-3 rounded-xl max-w-[80%] bg-red-500 text-white mx-auto text-center text-sm">
                 {error}
             </div>
        )}
      </div>

      {/* Styles previously from .input-container */}
      <div className="bg-gray-100 p-2 rounded-full flex items-center transition-shadow duration-300 focus-within:ring-2 focus-within:ring-blue-500 border border-gray-200">
        {/* Styles previously from input */}
        <input
          type="text"
          placeholder="Ask about your calendar..."
          value={input}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
          className="bg-transparent border-none text-gray-800 flex-grow text-base p-2 outline-none placeholder-gray-500 disabled:opacity-60"
        />
        {/* Styles previously from .send-icon */}
        <button
          onClick={sendMessage}
          disabled={isLoading || !input.trim()}
          className="text-2xl p-2 rounded-full text-blue-500 bg-transparent border-none transition-transform duration-300 hover:scale-110 hover:bg-blue-100 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:bg-transparent"
          aria-label="Send message"
        >
          <FiSend />
        </button>
      </div>
    </div>
  );
};

export default Chat;

// Add server-side authentication check
export async function getServerSideProps(context) {
  const session = await getServerSession(context.req, context.res, authOptions);
  
  // If no session exists, redirect to home page
  if (!session) {
    return {
      redirect: {
        destination: '/',
        permanent: false,
      },
    };
  }
  
  // If session exists, just return empty props
  return {
    props: {},
  };
}