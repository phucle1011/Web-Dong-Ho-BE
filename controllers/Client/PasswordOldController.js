const bcrypt = require("bcryptjs");
const User = require('../../models/usersModel');

const changePassword = async (req, res) => {
  try {
    const { old_password, new_password, confirm_password } = req.body;
    const userId = req.user?.id;

    if (!old_password || !new_password || !confirm_password) {
      return res.status(400).json({ message: "Vui lòng nhập đầy đủ thông tin." });
    }

    if (new_password !== confirm_password) {
      return res.status(400).json({ message: "Mật khẩu mới và xác nhận không khớp." });
    }

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ message: "Người dùng không tồn tại." });
    }

    const isMatch = await bcrypt.compare(old_password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Mật khẩu cũ không đúng." });
    }

    const hashedPassword = await bcrypt.hash(new_password, 10);
    user.password = hashedPassword;
    await user.save();

    res.status(200).json({ message: "Cập nhật mật khẩu thành công." });
  } catch (err) {
    console.error("Lỗi đổi mật khẩu:", err);
    res.status(500).json({ message: "Đã xảy ra lỗi máy chủ." });
  }
};

module.exports = { changePassword };
