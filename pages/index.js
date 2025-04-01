import { signIn, useSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { useState, useEffect } from 'react';
// Consider using an icon library like react-icons
import { FaGoogle, FaCalendarAlt, FaRobot, FaComments } from 'react-icons/fa';
import { getServerSession } from 'next-auth/next';
import { authOptions } from './api/auth/[...nextauth]';

export default function Home({ validSession }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [error, setError] = useState(null);
  const [isSigningIn, setIsSigningIn] = useState(false);

  // Redirect if session exists
  useEffect(() => {
    // Only redirect if the session is valid (confirmed by server)
    if (session && validSession) {
      router.push('/chat').catch(err => {
        console.error("Redirect failed:", err);
        setError("Failed to redirect to chat. Please try reloading.");
        // Don't keep showing redirecting message if stuck
      });
    }
  }, [session, router]);

  const handleSignIn = async () => {
    setIsSigningIn(true);
    setError(null); // Clear previous errors
    try {
      // No need to await signIn if using callbackUrl, it handles the redirect
      signIn('google', { callbackUrl: '/chat' });
      // If signIn fails *before* redirecting (unlikely), the catch block handles it.
    } catch (err) {
      console.error("Sign in failed:", err);
      setError("Failed to initiate sign in. Please check your connection and try again.");
      setIsSigningIn(false);
    }
  };

  // --- Loading Authentication Status ---
  if (status === 'loading') {
    return (
      // Styles previously from .loading
      <div className="flex justify-center items-center h-screen text-gray-600">
        Loading...
      </div>
    );
  }

  // --- Redirecting State ---
  if (session && validSession) {
     return (
      // Styles previously from .loading
      <div className="flex justify-center items-center h-screen text-gray-600">
        Redirecting to chat...
      </div>
     );
  }

  // --- Login Page Content ---
  return (
    <>
      <Head>
        <title>Google Calendar AI Chatbot</title>
        <meta name="description" content="Interact with your Google Calendar using natural language. Simplify your scheduling experience with the power of AI." />
        <link rel="icon" href="/favicon.ico" /> {/* Example Favicon */}
      </Head>
      {/* Styles previously from .container */}
      <main className="w-full max-w-4xl bg-white rounded-3xl p-8 md:p-10 shadow-lg mx-auto text-center">
        {/* Styles previously from h1 */}
        <h1 className="text-4xl md:text-5xl text-blue-500 font-semibold mb-4">
          Google Calendar{' '}
          {/* Styles previously from .highlight */}
          <span className="text-gray-600">AI Chatbot</span>
        </h1>
        {/* Styles previously from p */}
        <p className="leading-relaxed mb-8 text-gray-700 max-w-2xl mx-auto">
          Interact with your Google Calendar using natural language. Simplify your scheduling experience with the power of AI.
        </p>

        {/* Display error message if any */}
        {error && (
          // Styles previously from .error (adapted)
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-6 max-w-md mx-auto" role="alert">
            <span className="block sm:inline">{error}</span>
          </div>
        )}

        {/* Styles previously from .features */}
        <div className="flex flex-col sm:flex-row justify-center items-center gap-8 sm:gap-12 mb-10">
          {/* Styles previously from .feature */}
          <div className="flex flex-col items-center text-gray-700">
            {/* Styles previously from .feature i */}
            <FaCalendarAlt className="text-3xl text-blue-500 mb-2" />
            <span className="text-sm">Easy Scheduling</span>
          </div>
          <div className="flex flex-col items-center text-gray-700">
            <FaRobot className="text-3xl text-blue-500 mb-2" />
            <span className="text-sm">AI-Powered</span>
          </div>
          <div className="flex flex-col items-center text-gray-700">
            <FaComments className="text-3xl text-blue-500 mb-2" />
            <span className="text-sm">Natural Language</span>
          </div>
        </div>

        {/* Styles previously from .google-btn */}
        <button
          onClick={handleSignIn}
          disabled={isSigningIn}
          className="inline-flex items-center bg-blue-500 text-white py-3 px-6 rounded-lg font-semibold transition-colors duration-300 hover:bg-blue-600 disabled:opacity-70 disabled:cursor-not-allowed"
        >
          {/* Styles previously from .google-btn i */}
          <FaGoogle className="mr-2 text-lg" />
          {isSigningIn ? 'Signing In...' : 'Sign in with Google'}
        </button>
      </main>
    </>
  );
}

// Add server-side session validation
export async function getServerSideProps(context) {
  const session = await getServerSession(context.req, context.res, authOptions);
  
  // Check if the session is valid
  const validSession = !!session && !session.error;
  
  return {
    props: {
      validSession: validSession,
    },
  };
}