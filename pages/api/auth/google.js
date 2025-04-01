// This route is deprecated. Please use NextAuth.js for authentication.
// See pages/api/auth/[...nextauth].js for the NextAuth configuration.

export default function handler(req, res) {
  res.status(301).redirect('/api/auth/signin');
}
