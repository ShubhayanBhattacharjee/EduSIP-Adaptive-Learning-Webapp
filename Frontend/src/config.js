// One place for the backend address. Set REACT_APP_API_URL in .env (see .env.example).
// No trailing slash. Falls back to the local backend for development.
const API_URL = (process.env.REACT_APP_API_URL || "http://localhost:5000").replace(/\/+$/, "");
export default API_URL;
