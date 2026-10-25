// From utils.js
export function redirect(path) { 
  window.location.href = path; 
}

export function setToken(token) { 
  localStorage.setItem("token", token); 
}

export function getToken() { 
  return localStorage.getItem("token"); 
}

export function showToast(msg) { 
  alert(msg); 
}

// Additional helper for form validation (from login.js and register.js)
export const validateEmail = (email) => {
  return email.includes('@');
};

export const validatePassword = (password) => {
  return password.length >= 6;
};

export const validateName = (name) => {
  return name.length >= 3;
};