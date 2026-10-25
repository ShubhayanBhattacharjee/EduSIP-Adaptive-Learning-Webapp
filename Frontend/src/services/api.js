// From config.js
const CONFIG = {
  BASE_URL: "http://localhost:5000"
};

// From api.js - postRequest function
export async function postRequest(endpoint, body) {
  try {
    const res = await fetch(CONFIG.BASE_URL + endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    
    return res.json();
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
}

// From api.js - getToken function
export function getToken() {
  return localStorage.getItem("token");
}

// From api.js - fetchWithAuth function
export async function fetchWithAuth(endpoint) {
  const token = getToken();
  
  try {
    const res = await fetch(CONFIG.BASE_URL + endpoint, {
      headers: {
        "Authorization": "Bearer " + token,
        "Content-Type": "application/json"
      }
    });

    if (res.status === 401) {
      alert("Session expired. Please login again.");
      window.location.href = "/login";
      return null;
    }

    return res.json();
  } catch (error) {
    console.error('Auth Fetch Error:', error);
    throw error;
  }
}

// From api.js - loginUser function (keeping original comment)
export async function loginUser(email, password) {
  const response = await fetch(`${CONFIG.BASE_URL}/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ email, password })
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Login failed");
  }

  return data;
}

export default CONFIG;