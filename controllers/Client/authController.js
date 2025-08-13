const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const sendResetPassword = require("../../mail/resetPassword/sendmail");
require("dotenv").config();
const sendVerificationEmail = require("../../mail/verifyEmail/sendMail");
const { successResponse, errorResponse } = require('../../helpers/response');
const UserModel = require('../../models/usersModel');
const AddressModel = require("../../models/addressesModel");
const { Op } = require('sequelize');
const { OAuth2Client } = require('google-auth-library');
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const googleClient = new OAuth2Client(CLIENT_ID);
const { v4: uuidv4 } = require("uuid");


const JWT_SECRET = process.env.JWT_SECRET || "your_secret_key";

class AuthController {
    static async register(req, res) {
        try {
            const { name, email, password, phone, avatar } = req.body;
            const defaultAvatar =
                process.env.DEFAULT_AVATAR_URL ||
                "https://res.cloudinary.com/disgf4yl7/image/upload/v1753861568/user_zeaool.jpg";

            if (!name || typeof name !== 'string') {
                return errorResponse(res, "Họ tên không được để trống!", 400);
            }

            const trimmedName = name.trim();
            if (trimmedName.length < 2 || trimmedName.length > 40) {
                return errorResponse(res, "Họ tên chỉ từ 2 đến 40 ký tự!", 400);
            }

            const nameRegex = /^[a-zA-ZÀ-ỹ\s]+$/;
            if (!nameRegex.test(trimmedName)) {
                return errorResponse(res, "Họ tên chỉ chứa chữ cái và dấu cách!", 400);
            }

            // Kiểm tra email
            if (!email || !/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/.test(email)) {
                return errorResponse(res, "Email không hợp lệ!", 400);
            }

            // Kiểm tra password
            if (!password || password.length < 6) {
                return errorResponse(res, "Mật khẩu phải ít nhất 6 ký tự!", 400);
            }

            // Kiểm tra email đã tồn tại
            const existingUser = await UserModel.findOne({ where: { email } });
            if (existingUser) {
                return errorResponse(res, "Email này đã được đăng ký!", 400);
            }

            // **Kiểm tra số điện thoại đã tồn tại**
            if (phone) {
                const existingPhone = await UserModel.findOne({ where: { phone } });
                if (existingPhone) {
                    return errorResponse(res, "Số điện thoại này đã được sử dụng!", 400);
                }
            }

            // Hash password và tạo user
            const hashedPassword = await bcrypt.hash(password, 10);
            const verifyToken = jwt.sign({ email }, JWT_SECRET, { expiresIn: "1h" });

            const user = await UserModel.create({
                name: trimmedName,
                email,
                balance: null,
                password: hashedPassword,
                phone: phone || null,
                avatar: avatar || "user.png",
                role: "user",
                email_verified_at: null,
                status: "active"
            });

            await sendVerificationEmail(email, verifyToken);

            return successResponse(res, "Đăng ký thành công! Vui lòng kiểm tra email để xác thực.", {
                id: user.id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                avatar: user.avatar
            }, 201);

        } catch (error) {
            console.error("Lỗi server:", error);
            return errorResponse(res, "Lỗi server, vui lòng thử lại!", 500);
        }
    }

    static async verifyEmail(req, res) {
        const { token } = req.query;

        if (!token) {
            return errorResponse(res, "Token không tồn tại!", 400);
        }

        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            const { email } = decoded;

            const user = await UserModel.findOne({ where: { email } });

            if (!user) {
                return errorResponse(res, "Không tìm thấy người dùng!", 404);
            }

            if (user.email_verified_at) {
                return successResponse(res, null, { email }); // Không gửi thông báo, chỉ dữ liệu
            }

            await user.update({ email_verified_at: new Date() });
            return successResponse(res, null, { email });
        } catch (error) {
            if (error.name === 'TokenExpiredError') {
                return errorResponse(res, "Liên kết xác thực đã hết hạn!", 401);
            }
            return errorResponse(res, "Liên kết không hợp lệ!", 400);
        }
    }

    static async login(req, res) {
        try {
            const { email, password, rememberMe } = req.body;

            if (!email || !password) {
                return errorResponse(res, "Email và mật khẩu là bắt buộc!", 400);
            }

            const user = await UserModel.findOne({ where: { email } });
            if (!user) {
                return errorResponse(res, "Email không tồn tại!", 400);
            }

            if (!user.email_verified_at) {
                return errorResponse(
                    res,
                    "Vui lòng xác thực email trước khi đăng nhập!",
                    403
                );
            }

            if (user.status === 'locked') {
                return errorResponse(res, "Tài khoản bị khóa!", 403);
            }

            const isMatch = await bcrypt.compare(password, user.password);
            if (!isMatch) {
                return errorResponse(res, "Mật khẩu không chính xác!", 400);
            }

            if (user.status === 'inactive') {
                await user.update({
                    status: 'active',
                    lockout_reason: null
                });
            }

            await user.update({ last_active_at: new Date() });

            const now = new Date();
            if (user.remember_token) {
                const tokenExpiry = new Date(user.updated_at);
                tokenExpiry.setDate(tokenExpiry.getDate() + 30);
                if (now > tokenExpiry) {
                    await user.update({ remember_token: null });
                }
            }

            const expiresIn = rememberMe ? "30d" : "2h";
            const token = jwt.sign(
                {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    phone: user.phone,
                    email_verified_at: user.email_verified_at
                },
                JWT_SECRET,
                { expiresIn }
            );

            if (rememberMe) {
                await user.update({ remember_token: token });
            }

            let rememberToken = null;
            if (rememberMe) {
                rememberToken = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "30d" });
                await user.update({ remember_token: rememberToken });
            }

            return successResponse(res, "Đăng nhập thành công!", {
                token,
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    phone: user.phone,
                    email_verified_at: user.email_verified_at,
                    role: user.role,
                    status: user.status
                },
                rememberToken
            }, 200);

        } catch (error) {
            console.error("Lỗi server:", error);
            return errorResponse(res, "Đăng nhập thất bại!", 500);
        }
    }

    static async checkToken(req, res) {
        try {
            const token = req.headers.authorization?.split("Bearer ")[1];
            if (!token) {
                return errorResponse(res, "Token không được cung cấp!", 401);
            }

            const decoded = jwt.verify(token, JWT_SECRET);
            const user = await UserModel.findOne({ where: { id: decoded.id } });

            if (!user) {
                return errorResponse(res, "Người dùng không tồn tại!", 404);
            }

            return successResponse(res, "Token hợp lệ!", {
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                },
            }, 200);
        } catch (error) {
            if (error.name === "TokenExpiredError") {
                return errorResponse(res, "Phiên đăng nhập đã hết hạn!", 401);
            }
            if (error.name === "JsonWebTokenError") {
                return errorResponse(res, "Token không hợp lệ!", 401);
            }
            return errorResponse(res, "Lỗi server!", 500);
        }
    }

    static async updateVerification(req, res) {
        try {
            const { email } = req.body;

            if (!email) {
                return errorResponse(res, "Email là bắt buộc", 400);
            }

            const user = await UserModel.findOne({ where: { email } });
            if (!user) {
                return errorResponse(res, "Không tìm thấy người dùng", 404);
            }

            // Cập nhật thời gian xác thực
            await user.update({ email_verified_at: new Date() });

            return successResponse(res, "Cập nhật trạng thái xác thực thành công");
        } catch (error) {
            console.error("Lỗi khi cập nhật xác thực:", error);
            return errorResponse(res, "Lỗi server", 500);
        }
    }

    static async googleLogin(req, res) {
        try {
            const { idToken, rememberMe } = req.body;
            // 1. Verify ID token
            const ticket = await googleClient.verifyIdToken({
                idToken,
                audience: CLIENT_ID,
            });
            const payload = ticket.getPayload();
            const { email, sub: googleId, name, picture } = payload;

            // 2. Tìm hoặc tạo user
            let user = await UserModel.findOne({ where: { email } });

            if (user && user.status === 'locked') {
                return errorResponse(res, "Tài khoản bị khóa!", 403);
            }

            if (!user) {
                // Sinh mật khẩu ngẫu nhiên và hash
                const randomPassword = uuidv4();
                const hashedPassword = await bcrypt.hash(randomPassword, 10);

                user = await UserModel.create({
                    name,
                    email,
                    password: hashedPassword,      // ← thêm trường password
                    avatar: picture,
                    googleId,
                    email_verified_at: new Date(),
                    role: 'user',
                    status: 'active',
                });
            } else if (!user.googleId) {
                // Lần đầu login bằng Google, lưu googleId + avatar
                await user.update({ googleId, avatar: picture });
            }

            // 3. Sinh JWT với payload thống nhất
            const expiresIn = rememberMe ? '30d' : '2h';
            const token = jwt.sign(
                {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    phone: user.phone,
                    email_verified_at: user.email_verified_at
                },
                JWT_SECRET,
                { expiresIn }
            );

            if (rememberMe) {
                await user.update({ remember_token: token });
            }

            // 4. Trả về response giống luồng thường
            return successResponse(res, 'Đăng nhập Google thành công!', {
                token,
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    phone: user.phone,
                    email_verified_at: user.email_verified_at,
                    role: user.role,
                    status: user.status
                },
                rememberToken: rememberMe ? token : null
            }, 200);

        } catch (err) {
            console.error(err);
            return errorResponse(res, 'Token Google không hợp lệ!', 401);
        }
    }

    //-------------------[ RESET PASSWORD ]--------------------------
    static async resetPassword(req, res) {
        const { email } = req.body;
        try {
            const user = await UserModel.findOne({ where: { email } });
            if (!user) {
                return errorResponse(res, "Email không tồn tại!", 404);
            }

            if (user.status === 'locked') {
                return errorResponse(res, "Tài khoản bị khóa, không thể đặt lại mật khẩu!", 403);
            }

            const token = jwt.sign(
                { email: user.email, id: user.id },
                JWT_SECRET,
                { expiresIn: "1h" }
            );

            await user.update({ password_reset_token: token });

            const resetLink = `${process.env.CLIENT_URL}/reset-password?token=${token}`;
            await sendResetPassword(email, resetLink);

            return successResponse(res, "Kiểm tra email để đặt lại mật khẩu!", null, 200);
        } catch (error) {
            console.error("Lỗi xảy ra khi reset password:", error);
            return errorResponse(res, "Lỗi server, vui lòng thử lại!", 500);
        }
    }

    static async updatePassword(req, res) {
        const { token } = req.params;
        const { password } = req.body;

        try {
            const decoded = jwt.verify(token, JWT_SECRET);

            const user = await UserModel.findOne({
                where: {
                    id: decoded.id,
                    password_reset_token: token
                }
            });
            if (!user) {
                return errorResponse(res, "Liên kết không hợp lệ hoặc đã dùng rồi!", 401);
            }

            const hashedPassword = await bcrypt.hash(password, 10);
            await user.update({
                password: hashedPassword,
                password_reset_token: null,
                remember_token: null
            });

            return successResponse(res, "Cập nhật mật khẩu thành công!", null, 200);
        } catch (error) {
            console.error("Lỗi khi cập nhật mật khẩu:", error);
            if (error.name === "TokenExpiredError") {
                return errorResponse(res, "Liên kết đặt lại mật khẩu đã hết hạn!", 401);
            }
            if (error.name === "JsonWebTokenError") {
                return errorResponse(res, "Liên kết không hợp lệ!", 400);
            }
            return errorResponse(res, "Lỗi server, vui lòng thử lại!", 500);
        }
    }

    static async getById(req, res) {
        try {
            const { id } = req.params;

            if (!id || isNaN(id)) {
                return errorResponse(res, "ID không hợp lệ!", 400);
            }

            const user = await UserModel.findOne({
                where: { id },
                attributes: { exclude: ['password'] },
                include: [
                    {
                        model: AddressModel,
                        as: 'addresses',
                        attributes: ['id', 'address_line', 'ward', 'district', 'city', 'is_default']
                    }
                ]
            });

            if (!user) {
                return errorResponse(res, "Không tìm thấy người dùng!", 404);
            }

            return successResponse(res, "Lấy thông tin người dùng thành công!", user, 200);
        } catch (error) {
            console.error("Lỗi khi lấy thông tin người dùng:", error);
            return errorResponse(res, "Lỗi server, vui lòng thử lại!", 500);
        }
    }

    static async update(req, res) {
        try {
            const { id } = req.params;
            const { name, phone, avatar, email } = req.body;

            if (!id || isNaN(id)) {
                return errorResponse(res, "ID không hợp lệ!", 400);
            }

            const user = await UserModel.findByPk(id);
            if (!user) {
                return errorResponse(res, "Không tìm thấy người dùng!", 404);
            }

            // Kiểm tra số điện thoại không trùng
            if (phone) {
                const phoneExists = await UserModel.findOne({
                    where: {
                        phone,
                        id: { [Op.ne]: id } // loại trừ user đang cập nhật
                    }
                });
                if (phoneExists) {
                    return errorResponse(res, "Số điện thoại này đã được sử dụng!", 400);
                }
            }

            // Kiểm tra tên
            if (name) {
                const trimmedName = name.trim();
                const nameRegex = /^[a-zA-ZÀ-ỹ\s]+$/;
                if (trimmedName.length < 2 || trimmedName.length > 50 || !nameRegex.test(trimmedName)) {
                    return errorResponse(res, "Tên không hợp lệ!", 400);
                }
            }

            // Kiểm tra email hợp lệ
            if (email) {
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (!emailRegex.test(email)) {
                    return errorResponse(res, "Email không hợp lệ!", 400);
                }
            }

            await user.update({
                name: name || user.name,
                phone: phone || user.phone,
                avatar: avatar || user.avatar,
                email: email || user.email
            });

            return successResponse(res, "Cập nhật thông tin người dùng thành công!", null, 200);
        } catch (error) {
            console.error("Lỗi khi cập nhật người dùng:", error);
            return errorResponse(res, "Lỗi server, vui lòng thử lại!", 500);
        }
    }

}

module.exports = AuthController;
