// Admins and super admins. Use after protect. (protect already guarantees an admin holds a staff-scope token.)
const amd = (req, res, next) => {
  if (!["admin", "superadmin"].includes(req.user.role) || req.user.scope !== "staff") {
    return res.status(403).json({
      success: false,
      message: "Admin access only"
    });
  }
  next();
};
module.exports = amd;
