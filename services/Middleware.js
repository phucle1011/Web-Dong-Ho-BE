const jwt = require("jsonwebtoken");
const User = require("../models/usersModel");

const authenticate = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: "Token không tồn tại." });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findByPk(decoded.id);
    if (!user) return res.status(401).json({ message: "Xác thực thất bại." });

    req.user = { id: user.id }; 
    next();
  } catch (err) {
    return res.status(401).json({ message: "Token không hợp lệ." });
  }
};

module.exports = authenticate;
