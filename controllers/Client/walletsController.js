const WithdrawRequestsModel = require('../../models/withdrawRequestsModel');
const UserModel = require('../../models/usersModel');
const OrderModel = require('../../models/ordersModel');

const { Op } = require('sequelize');
const sequelize = require('../../config/database');

require("dotenv").config();
const nodemailer = require("nodemailer");

class WalletsController {

  static async get(req, res) {
    const userId = req.user.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Không xác định được người dùng.',
      });
    }
    try {
      const users = await UserModel.findAll({
        where: { id: userId },
        include: [
          {
            model: WithdrawRequestsModel,
            as: 'withdrawRequests',
          },
          {
            model: OrderModel,
            as: 'orders',
            attributes: ['id', 'total_price', 'status', 'created_at'],
            where: {
              status: {
                [Op.in]: ['completed', 'cancelled']
              }
            },
            required: false
          }
        ],
        order: [['created_at', 'DESC']]
      });

      res.status(200).json({
        success: true,
        message: 'Danh sách ví',
        data: users
      });
    } catch (error) {
      console.error('WalletsController.get error:', error.message, error.stack);
      res.status(500).json({
        success: false,
        message: 'Lỗi khi lấy danh sách ví',
        error: error.message
      });
    }
  }

  static async requestWithdraw(req, res) {
    try {
      const { amount, method, bank_account, note, bank_name, receiver_name  } = req.body;
      const userId = req.user.id;

      if (!amount || !method || !bank_account || !bank_name) {
        return res.status(400).json({
          success: false,
          message: "Thiếu thông tin rút tiền"
        });
      }

      const wallet = await UserModel.findOne({ where: { id: userId } });
      if (!wallet || amount > wallet.balance) {
        return res.status(400).json({
          success: false,
          message: "Số dư không đủ để thực hiện rút tiền"
        });
      }

      await WithdrawRequestsModel.create({
        user_id: userId,
        amount,
        method: "bank",
        bank_account,
        bank_name,
        receiver_name,
        note: note || 'Yêu cầu rút tiền',
        status: 'pending',
        type: 'withdraw'
      });

      await WalletsController.sendWithdrawEmail(wallet, amount, bank_name, bank_account, receiver_name);

      res.status(200).json({
        success: true,
        message: "Yêu cầu rút tiền đã được gửi, đang chờ xử lý."
      });
    } catch (err) {
      console.error("Lỗi tạo yêu cầu rút tiền:", err);
      res.status(500).json({
        success: false,
        message: "Lỗi máy chủ"
      });
    }
  }

  static async sendWithdrawEmail(wallet, amount, bankName, bankAccount, receiver_name) {
    try {
      const formattedAmount = new Intl.NumberFormat("vi-VN").format(amount);
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS,
        },
      });

      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: wallet.email,
        subject: "Xác nhận yêu cầu rút tiền",
        html: `
          <p>Chào ${wallet.name || "bạn"},</p>
          <p>Bạn vừa gửi yêu cầu rút <strong>${formattedAmount}₫</strong> về tài khoản ngân hàng.</p>
          <p><strong>Tên người nhận:</strong> ${receiver_name}</p>
          <p><strong>Ngân hàng:</strong> ${bankName.toUpperCase()}</p>
          <p><strong>Số tài khoản:</strong> ${bankAccount}</p>
          <p><strong>Trạng thái hiện tại:</strong> Đang chờ duyệt</p>
          <p>Chúng tôi sẽ xử lý trong thời gian sớm nhất. Cảm ơn bạn!</p>
          <p>-- Hệ thống Đồng Hồ TimesMaster --</p>
        `,
      };

      await transporter.sendMail(mailOptions);
    } catch (err) {
      console.error("Gửi email thất bại:", err);
    }
  }

  static async getTopupHistory(req, res) {
    const userId = req.query.userId || req.user.id;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const offset = (page - 1) * limit;

    try {
      const topups = await WithdrawRequestsModel.findAll({
        where: {
          user_id: userId,
          note: 'Nạp tiền từ Stripe',
          type: 'recharge'
        },
        order: [['created_at', 'DESC']],
        limit,
        offset
      });

      const totalTopups = await WithdrawRequestsModel.count({
        where: {
          user_id: userId,
          note: 'Nạp tiền từ Stripe',
          type: 'recharge'
        }
      });

      return res.status(200).json({
        success: true,
        message: 'Lịch sử nạp tiền Stripe',
        data: topups,
        pagination: {
          total: totalTopups,
          page,
          totalPages: Math.ceil(totalTopups / limit)
        }
      });
    } catch (error) {
      console.error("Lỗi lấy lịch sử nạp tiền:", error);
      return res.status(500).json({
        success: false,
        message: 'Lỗi máy chủ',
        error: error.message
      });
    }
  }

  static async deductFee(req, res) {
    const userId = req.user.id;
    const { orderId, amount } = req.body;

    if (!orderId || !amount || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Thiếu dữ liệu hoặc amount không hợp lệ' });
    }

    const fee = Math.floor(amount * 0.1);

    const t = await sequelize.transaction();
    try {
      const user = await UserModel.findByPk(userId, { transaction: t, lock: t.LOCK.UPDATE });
      if (!user) {
        await t.rollback();
        return res.status(400).json({ success: false, message: 'Người dùng không tồn tại' });
      }

      user.failed_payment_count = (user.failed_payment_count || 0) + 1;
      
      const deducted = (user.balance || 0) < fee
        ? Number(user.balance)
        : fee;

      user.balance = Number(user.balance) - deducted;
      await user.save({ transaction: t });

      await WithdrawRequestsModel.create({
        user_id: userId,
        amount: deducted,
        method: 'bank',
        note: `Phí quên thanh toán đơn hàng đấu giá`,
        status: 'approved',
        type: 'withdraw',
        bank_account: "",
        bank_name: "",
      }, { transaction: t });

      await t.commit();

      await WalletsController.sendExpiredPaymentEmail(user, deducted, amount);

      return res.json({
        success: true,
        message: `Đã trừ ${deducted.toLocaleString('vi-VN')}₫ phí quên thanh toán`
      });

    } catch (err) {
      await t.rollback();
      console.error('deductFee error:', err.message, err.stack);
      return res.status(500).json({
        success: false,
        message: 'Lỗi server',
        error: err.message
      });
    }
  }

  static async sendExpiredPaymentEmail(user, fee, total) {
    try {
      const formattedFee = new Intl.NumberFormat('vi-VN').format(fee);
      const formattedTotal = new Intl.NumberFormat('vi-VN').format(total);
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS
        }
      });
      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: user.email,
        subject: 'Thông báo trừ phí quên thanh toán đơn hàng đấu giá thành công',
        html: `
          <p>Chào ${user.name || 'bạn'},</p>
          <p>Đơn hàng đấu giá có tổng <strong>${formattedTotal}₫</strong> đã hết hạn thanh toán.</p>
          <p>
            Chúng tôi đã trừ <strong>${formattedFee}₫</strong>
            ${deducted === fee
                ? ' (10% của tổng đơn)'
                : ' (toàn bộ số dư còn lại)'} 
            vào ví tiền của bạn.
          </p>
          <p>Cảm ơn bạn đã sử dụng dịch vụ!</p>
          <p>-- TimesMaster --</p>
        `
      });
    } catch (e) {
      console.error('sendExpiredPaymentEmail error:', e);
    }
  }
}

module.exports = WalletsController;