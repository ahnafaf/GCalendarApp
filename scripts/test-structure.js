// Test script to verify the new project structure
const fs = require('fs');
const path = require('path');

// Define the expected directory structure
const expectedStructure = {
  'src': {
    'components': {
      '': [],
      'chat': ['ChatInterface.js'],
      'layout': ['Header.js'],
      'ui': ['GridItem.js']
    },
    'config': ['api-config.js', 'auth-config.js'],
    'database': {
      '': ['db-client.js', 'db-setup.js', 'init-db.js'],
      'models': ['event.js', 'session.js']
    },
    'middleware': ['auth-middleware.js'],
    'pages': {
      '': ['_app.js', 'about.js', 'chat.js', 'contact.js', 'features.js', 'index.js'],
      'api': {
        '': ['chat.js', 'events.js'],
        'auth': ['[...nextauth].js', 'google.js']
      }
    },
    'services': {
      'auth': ['auth-service.js'],
      'calendar': ['calendar-actions.js', 'google-calendar.js'],
      'chat': ['chatbot.js']
    },
    'styles': ['chat.css', 'global.css'],
    'utils': ['api-utils.js', 'date-utils.js']
  },
  'public': ['favicon.ico'],
  'scripts': ['setup-db.js', 'test-structure.js'],
  'data': []
};

// Function to check if a directory exists
function directoryExists(dirPath) {
  try {
    return fs.statSync(dirPath).isDirectory();
  } catch (err) {
    return false;
  }
}

// Function to check if a file exists
function fileExists(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch (err) {
    return false;
  }
}

// Function to verify the structure
function verifyStructure(structure, basePath = '.') {
  let allValid = true;
  
  for (const [dir, contents] of Object.entries(structure)) {
    const dirPath = path.join(basePath, dir);
    
    if (!directoryExists(dirPath)) {
      console.error(`❌ Directory not found: ${dirPath}`);
      allValid = false;
      continue;
    }
    
    console.log(`✅ Directory exists: ${dirPath}`);
    
    if (Array.isArray(contents)) {
      // Check files in this directory
      for (const file of contents) {
        const filePath = path.join(dirPath, file);
        if (!fileExists(filePath)) {
          console.error(`❌ File not found: ${filePath}`);
          allValid = false;
        } else {
          console.log(`✅ File exists: ${filePath}`);
        }
      }
    } else if (typeof contents === 'object') {
      // Check subdirectories
      for (const [subdir, subContents] of Object.entries(contents)) {
        const subdirPath = subdir === '' ? dirPath : path.join(dirPath, subdir);
        if (Array.isArray(subContents)) {
          // Check files in this subdirectory
          if (subdir !== '') {
            if (!directoryExists(subdirPath)) {
              console.error(`❌ Directory not found: ${subdirPath}`);
              allValid = false;
              continue;
            }
            console.log(`✅ Directory exists: ${subdirPath}`);
          }
          
          for (const file of subContents) {
            const filePath = path.join(subdirPath, file);
            if (!fileExists(filePath)) {
              console.error(`❌ File not found: ${filePath}`);
              allValid = false;
            } else {
              console.log(`✅ File exists: ${filePath}`);
            }
          }
        } else {
          // Recursively check nested structure
          const subResult = verifyStructure({ [subdir]: subContents }, dirPath);
          allValid = allValid && subResult;
        }
      }
    }
  }
  
  return allValid;
}

// Run the verification
console.log('Testing project structure...');
const result = verifyStructure(expectedStructure);

if (result) {
  console.log('\n✅ Project structure verification passed!');
} else {
  console.error('\n❌ Project structure verification failed!');
  process.exit(1);
}