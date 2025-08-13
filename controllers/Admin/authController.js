const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { successResponse, errorResponse } = require('../../helpers/response');
const UserModel = require("../../models/usersModel");
require("dotenv").config();

const JWT_SECRET = process.env.JWT_SECRET || "your_secret_key";

class AuthController {
  static async loginAdmin(req, res) {
    const { email, password } = req.body;

    // Kiểm tra dữ liệu đầu vào
    if (!email || !password) {
      return errorResponse(res, "Email và mật khẩu không được để trống!", 400);
    }
    if (!/\S+@\S+\.\S+/.test(email)) {
      return errorResponse(res, "Email không hợp lệ!", 400);
    }

    try {
      const user = await UserModel.findOne({ where: { email } });
      if (!user) {
        return errorResponse(res, "Email không tồn tại!", 401);
      }

      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        return errorResponse(res, "Mật khẩu không chính xác!", 401);
      }

      if (user.role !== "admin") {
        return errorResponse(res, "Bạn không có quyền truy cập admin!", 403);
      }

      if (user.status === "locked") {
        return errorResponse(res, "Tài khoản đã bị khóa!", 403);
      }

      const token = jwt.sign(
        {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          phone: user.phone,
          email_verified_at: user.email_verified_at,
        },
        JWT_SECRET,
        { expiresIn: "2h" }
      );

      return successResponse(res, "Đăng nhập admin thành công!", { token }, 200);
    } catch (error) {
      return errorResponse(res, "Lỗi server, vui lòng thử lại!", 500);
    }
  }
}

module.exports = AuthController;