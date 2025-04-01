#!/usr/bin/env node

const { google } = require('googleapis');
const fs = require('fs');
const readline = require('readline');
require('dotenv').config();

/**
 * This script helps you get Google OAuth tokens for testing the Calendar API.
 * It provides an authorization URL to open in your browser,
 * then prompts you to paste the authorization code to get tokens.
 */

// Get client credentials from .env
const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.error('Error: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set in .env file');
  process.exit(1);
}

// Create readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Create OAuth2 client
const oauth2Client = new google.auth.OAuth2(
  clientId,
  clientSecret,
  'http://localhost:3000/auth/google/callback'  // Use one of your authorized redirect URIs
);

// Generate auth URL
const scopes = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events'
];

const authorizeUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: scopes,
  prompt: 'consent'  // Force to get refresh token
});

console.log('\n=== Google Calendar API Token Generator ===\n');
console.log('Follow these steps to get your tokens:\n');
console.log('1. Copy this URL and open it in your browser:');
console.log('\n' + authorizeUrl + '\n');
console.log('2. Sign in with your Google account and authorize the application');
console.log('3. You will be redirected to a page that might show an error - this is expected');
console.log('4. Copy the "code" parameter from the URL in your browser address bar');
console.log('   (It starts after "code=" and ends before any "&" character)\n');
 
rl.question('Enter the authorization code from the URL: ', async (code) => {
  try {
    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code);
    
    // Save tokens to file
    const envAdditions = {
      GOOGLE_ACCESS_TOKEN: tokens.access_token,
      GOOGLE_REFRESH_TOKEN: tokens.refresh_token || ''
    };
    
    // Update .env file directly
    let envContent = '';
    try {
      envContent = fs.readFileSync('.env', 'utf8');
    } catch (err) {
      console.log('No existing .env file found, creating a new one.');
    }
    
    // Replace or add token values in .env content
    Object.entries(envAdditions).forEach(([key, value]) => {
      const regex = new RegExp(`^${key}=.*$`, 'm');
      if (envContent.match(regex)) {
        envContent = envContent.replace(regex, `${key}=${value}`);
      } else {
        envContent += `\n${key}=${value}`;
      }
    });
    
    // Write updated content back to .env file
    fs.writeFileSync('.env', envContent);
    
    console.log('\n✅ Authorization successful!');
    console.log('✅ Tokens have been saved directly to your .env file.');
    console.log('✅ You can now run your scripts that use Google Calendar API.\n');
  } catch (error) {
    console.error('❌ Error getting tokens:', error.message);
    console.log('\nPlease make sure you copied the correct authorization code.');
  } finally {
    rl.close();
  }
});