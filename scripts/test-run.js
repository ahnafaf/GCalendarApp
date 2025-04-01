// Test script to verify the application can run with the new structure
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('Testing application startup with new structure...');

// Check if the required files exist
const requiredFiles = [
  'src/pages/_app.js',
  'src/pages/index.js',
  'next.config.js'
];

let allFilesExist = true;
for (const file of requiredFiles) {
  if (!fs.existsSync(file)) {
    console.error(`❌ Required file not found: ${file}`);
    allFilesExist = false;
  } else {
    console.log(`✅ Required file exists: ${file}`);
  }
}

if (!allFilesExist) {
  console.error('❌ Cannot run test: missing required files');
  process.exit(1);
}

console.log('\nAttempting to start the application...');
console.log('This will run for 10 seconds to verify startup, then exit.');
console.log('Press Ctrl+C to stop the test early if needed.\n');

// Start the Next.js development server
const nextProcess = spawn('npx', ['next', 'dev'], {
  stdio: 'inherit',
  shell: true
});

// Set a timeout to kill the process after 10 seconds
setTimeout(() => {
  console.log('\n✅ Application startup test completed.');
  console.log('To fully test the application, run:');
  console.log('  npm run dev');
  console.log('\nTo test with the new structure, update imports and run:');
  console.log('  npm run dev');
  
  // Kill the Next.js process
  nextProcess.kill();
  process.exit(0);
}, 10000);

// Handle process exit
nextProcess.on('close', (code) => {
  if (code !== null && code !== 0) {
    console.error(`\n❌ Application startup failed with code ${code}`);
    process.exit(1);
  }
});

// Handle errors
nextProcess.on('error', (err) => {
  console.error(`\n❌ Failed to start application: ${err.message}`);
  process.exit(1);
});

console.log('Waiting for application to start...');