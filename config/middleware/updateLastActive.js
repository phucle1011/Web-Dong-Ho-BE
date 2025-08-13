// BE/middleware/updateLastActive.js
const UserModel = require('../../models/usersModel');

module.exports = async (req, res, next) => {
  // Giả định bạn đã attach `req.user` sau khi verify JWT
  if (req.user && req.user.id) {
    try {
      await UserModel.update(
        { last_active_at: new Date() },
        { where: { id: req.user.id } }
      );
    } catch (err) {
      console.error('Lỗi cập nhật last_active_at:', err);
    }
  }
  next();
};
