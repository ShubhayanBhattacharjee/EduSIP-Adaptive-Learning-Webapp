export const homeFor = (role) =>
  role === "admin" || role === "superadmin" ? "/admin" : role === "teacher" ? "/teacher" : "/dashboard";