// tailwind.config.js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
    // Add other paths if necessary
  ],
  theme: {
    extend: {
      colors: {
        // Map your original custom names to actual colors
        // Using the colors from your JS examples (blue-500)
        primary: {
          DEFAULT: '#3B82F6', // blue-500
          dark: '#2563EB',    // blue-600 (for hover)
        },
        secondary: {
          DEFAULT: '#6B7280', // gray-500 (adjust as needed for bot message/highlight)
          // You might want a text-secondary variant if different from background
        },
        background: '#F3F4F6', // gray-100
        card: '#FFFFFF',       // white
        text: {
          DEFAULT: '#1F2937', // gray-800
          secondary: '#4B5563', // gray-600 (for subtitles, secondary info)
        },
        // Add other custom colors if needed
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        heading: ['Montserrat', 'sans-serif'],
      },
      boxShadow: {
        card: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)', // Example: shadow-md
        'card-hover': '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)', // Example: shadow-lg
        // Or match the shadow-lg/shadow-xl used in the components
      },
      borderRadius: {
        '2xl': '1rem', // Ensure consistency
        '3xl': '1.5rem', // Ensure consistency
      },
      // You can add animation delays here if needed
      // animation: {
      //   'bounce-delay-1': 'bounce 1s infinite -0.32s',
      //   'bounce-delay-2': 'bounce 1s infinite -0.16s',
      // },
    },
  },
  plugins: [],
};