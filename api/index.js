// Vercel serverless entry. The Express app is a valid (req, res) handler, so we
// simply re-export it. All /api/* requests are rewritten to this function by
// vercel.json, and Express does the internal routing.
import app from '../server/index.js';

export default app;
