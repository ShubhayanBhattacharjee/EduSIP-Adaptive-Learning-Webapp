// Only the platform owner(s). Use after protect.
module.exports = (req, res, next) => {
  if (req.user.role !== "superadmin" || req.user.scope !== "staff") {
    return res.status(403).json({ success: false, message: "Super admin access only" });
  }
  next();
};
