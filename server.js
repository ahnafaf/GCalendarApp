const express = require('express');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const http = require('http');
const socketIo = require('socket.io');
const { setupGoogleCalendar } = require('./googleCalendar');
const { chat } = require('./chatbot');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Session configuration
app.use(session({
  secret: 'your_session_secret',
  resave: false,
  saveUninitialized: true
}));

// Passport configuration
app.use(passport.initialize());
app.use(passport.session());

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "http://localhost:3000/auth/google/callback"
  },
  function(accessToken, refreshToken, profile, cb) {
    // Here you would typically save the user to your database
    return cb(null, profile);
  }
));


passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

// Serve static files
app.use(express.static('public'));

// Routes
app.get('/auth/google',
  passport.authenticate('google', { scope: ['profile', 'email', 'https://www.googleapis.com/auth/calendar'] }));

app.get('/auth/google/callback', 
  passport.authenticate('google', { failureRedirect: '/' }),
  function(req, res) {
    res.redirect('/chat');
  });

app.get('/logout', (req, res) => {
  req.logout();
  res.redirect('/');
});

// Middleware to check if user is authenticated
function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect('/');
}

app.get('/chat', ensureAuthenticated, (req, res) => {
  res.sendFile(__dirname + '/public/chat.html');
});

// Socket.io
io.on('connection', (socket) => {
  console.log('New client connected');

  socket.on('message', async (message) => {
    const response = await chat(message);
    socket.emit('response', response);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// Setup Google Calendar
setupGoogleCalendar().then(() => {
  console.log('Google Calendar setup completed.');
}).catch(error => {
  console.error('Error setting up Google Calendar:', error);
});
