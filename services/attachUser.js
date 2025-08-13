const jwt  = require("jsonwebtoken");
const User = require("../models/usersModel");

const attachUser = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.split(" ")[1];
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findByPk(decoded.id);
      if (user) {
        req.user = { id: user.id };
      }
    } catch (err) {
      // token expired / invalid → bỏ qua
    }
  }
  next();
};

module.exports = attachUser;
