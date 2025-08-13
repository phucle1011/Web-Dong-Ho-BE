const UserModel = require('../../models/usersModel');
const AddressModel = require('../../models/addressesModel');
const nodemailer = require('nodemailer');
const { getEmailTemplate } = require('../../utils/emailTemplate');
const { Op } = require('sequelize');

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

const sendEmail = async (to, subject, htmlContent) => {
    const mailOptions = {
        from: `"TIMEMASTERS" <${process.env.EMAIL_USER}>`,
        to,
        subject,
        html: htmlContent
    };

    try {
        await transporter.sendMail(mailOptions);
    } catch (error) {
        console.error("Lỗi gửi email:", error.message);
    }
};

class UserController {

    static async get(req, res) {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 10;
            const offset = (page - 1) * limit;
            const { status } = req.query;

            const whereClause = {};
            if (status && status !== 'all') {
                whereClause.status = status;
            }

            const { count, rows: users } = await UserModel.findAndCountAll({
                where: whereClause,
                order: [['created_at', 'DESC']],
                attributes: ['id', 'name', 'email', 'phone', 'avatar', 'role', 'status', 'created_at', 'updated_at'],
                include: [],
                limit: limit,
                offset: offset
            });

            const allStatuses = ['active', 'locked'];
            const counts = await Promise.all(
                allStatuses.map(s => UserModel.count({ where: { status: s } }))
            );
            const totalAll = await UserModel.count();
            const countsObject = {
                all: totalAll,
                active: counts[0],
                // inactive: counts[1],
                locked: counts[1]    // đúng là phần tử thứ ba của mảng
            };



            res.status(200).json({
                status: 200,
                message: "Lấy danh sách người dùng thành công",
                data: users,
                totalPages: Math.ceil(count / limit),
                currentPage: page,
                counts: countsObject
            });
        } catch (error) {
            console.error("Lỗi khi lấy danh sách người dùng:", error);
            res.status(500).json({ error: error.message });
        }
    }

    static async getById(req, res) {
        try {
            const { id } = req.params;
            const { page = 1, limit = 5 } = req.query;
            const offset = (page - 1) * limit;

            const user = await UserModel.findByPk(id, {
                attributes: ['id', 'name', 'email', 'phone', 'avatar', 'role', 'status', 'created_at', 'updated_at'],
                include: [{
                    model: AddressModel,
                    as: 'addresses',
                    attributes: ['id', 'address_line', 'district', 'city', 'ward', 'is_default', 'created_at', 'updated_at']
                }]
            });

            if (!user) {
                return res.status(404).json({ message: "Người dùng không tồn tại" });
            }

            const { count, rows: addresses } = await AddressModel.findAndCountAll({
                where: { user_id: id },
                attributes: ['id', 'address_line', 'district', 'city', 'ward', 'is_default', 'created_at', 'updated_at'],
                offset,
                limit: parseInt(limit),
                order: [['is_default', 'DESC'], ['created_at', 'DESC']],
            });

            return res.status(200).json({
                status: 200,
                data: {
                    ...user.toJSON(),
                    addresses,
                    addressPagination: {
                        currentPage: parseInt(page),
                        totalPages: Math.ceil(count / limit),
                        totalItems: count,
                    },
                },
            });
        } catch (error) {
            console.error("Lỗi khi lấy chi tiết người dùng:", error);
            return res.status(500).json({ error: error.message });
        }
    }

    static async updateUserStatus(req, res) {
        try {
            const { id } = req.params;
            const { status, reason } = req.body;

            // Kiểm tra không cho tự cập nhật trạng thái chính mình
            if (req.user && req.user.id && parseInt(id) === parseInt(req.user.id)) {
                return res.status(403).json({
                    message: "Bạn không thể tự thay đổi trạng thái tài khoản của chính mình."
                });
            }

            if (!['active', 'locked'].includes(status)) {
                return res.status(400).json({ message: "Trạng thái không hợp lệ." });
            }

            if (!reason || typeof reason !== 'string' || reason.trim() === '') {
                return res.status(400).json({ message: "Vui lòng nhập lý do thay đổi trạng thái." });
            }

            const user = await UserModel.findByPk(id);
            if (!user) {
                return res.status(404).json({ message: "Người dùng không tồn tại." });
            }

            user.status = status;
            user.lockout_reason = reason;
            await user.save();

            const htmlContent = getEmailTemplate(user.name, status, reason);

            await sendEmail(user.email, "Thông báo thay đổi trạng thái tài khoản", htmlContent);

            // build lại counts để FE có thể lấy luôn mà không cần fetch lại
            const allStatuses = ['active', 'locked'];
            const counts = await Promise.all(
                allStatuses.map(s => UserModel.count({ where: { status: s } }))
            );
            const totalAll = await UserModel.count();
            const countsObject = {
                all: totalAll,
                active: counts[0],
                // inactive: counts[1],
                locked: counts[1]
            };

            res.status(200).json({
                message: `Cập nhật trạng thái người dùng thành công: ${status}`,
                counts: countsObject
            });

        } catch (error) {
            console.error("Lỗi khi cập nhật trạng thái người dùng:", error);
            res.status(500).json({ error: error.message });
        }
    }

    static async searchUser(req, res) {
        try {
            const { searchTerm, page = 1, limit = 10, status } = req.query;
            const currentPage = parseInt(page);
            const currentLimit = parseInt(limit);
            const offset = (currentPage - 1) * currentLimit;

            if (!searchTerm || searchTerm.trim() === '') {
                return res.status(400).json({ message: 'Vui lòng cung cấp từ khóa tìm kiếm.' });
            }

            const whereClause = {
                [Op.or]: [
                    { name: { [Op.like]: `%${searchTerm}%` } },
                    { email: { [Op.like]: `%${searchTerm}%` } },
                    { phone: { [Op.like]: `%${searchTerm}%` } }
                ]
            };

            if (status && ['active', 'locked'].includes(status)) {
                whereClause.status = status;
            }

            const { count, rows: users } = await UserModel.findAndCountAll({
                where: whereClause,
                attributes: ['id', 'name', 'email', 'phone', 'avatar', 'role', 'status', 'created_at'],
                order: [['created_at', 'DESC']],
                limit: currentLimit,
                offset: offset
            });

            if (count === 0) {
                return res.status(200).json({
                    status: 200,
                    message: 'Không tìm thấy người dùng nào.',
                    data: [],
                    totalPages: 1,
                    currentPage: currentPage
                });
            }

            const allCounts = await Promise.all([
                UserModel.count(),
                UserModel.count({ where: { status: 'active' } }),
                // UserModel.count({ where: { status: 'inactive' } }),
                UserModel.count({ where: { status: 'locked' } })
            ]);

            res.status(200).json({
                status: 200,
                message: 'Tìm kiếm người dùng thành công',
                data: users,
                totalPages: Math.ceil(count / currentLimit),
                currentPage: currentPage,
                counts: {
                    all: allCounts[0],
                    active: status === 'active' ? count : allCounts[1],
                    // inactive: status === 'inactive' ? count : allCounts[2],
                    locked: status === 'locked' ? count : allCounts[2]
                }
            });

        } catch (error) {
            console.error('Lỗi khi tìm kiếm người dùng:', error);
            res.status(500).json({ message: 'Lỗi server' });
        }
    }

    static async updateAvatar(req, res) {
        try {
            const { id } = req.params;
            const { avatar } = req.body;

            const user = await UserModel.findByPk(id);
            if (!user) {
                return res.status(404).json({ message: "Người dùng không tồn tại." });
            }

            user.avatar = avatar;
            await user.save();

            return res.status(200).json({
                status: 200,
                message: "Cập nhật avatar thành công.",
                data: { avatar: user.avatar }
            });
        } catch (error) {
            console.error('Lỗi khi cập nhật avatar:', error);
            return res.status(500).json({ message: error.message });
        }
    }
}

module.exports = UserController;