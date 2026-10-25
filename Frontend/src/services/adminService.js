const BASE_URL = "http://localhost:5000/admin"; // ✅ Correct backend route for admin
const getToken = () => localStorage.getItem("token"); // JWT

export const addQuestionAPI = async (payload) => {
  const res = await fetch(`${BASE_URL}/add-question`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getToken()}`, // send JWT for auth
    },
    body: JSON.stringify(payload),
  });

  return await res.json();
};

export const uploadCSVAPI = async (file) => {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${BASE_URL}/upload-csv`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getToken()}`, // send JWT for auth
      // DO NOT set Content-Type when sending FormData; browser sets it automatically
    },
    body: formData,
  });

  return await res.json();
};

// ------------------- NEW: Fetch Admin Analytics -------------------
export const getAnalyticsAPI = async () => {
  try {
    const res = await fetch(`${BASE_URL}/analytics`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${getToken()}`,
      },
    });

    return await res.json();
  } catch (error) {
    console.error("Error fetching analytics:", error);
    return { success: false };
  }
};

const adminService = { addQuestionAPI, uploadCSVAPI, getAnalyticsAPI };
export default adminService;