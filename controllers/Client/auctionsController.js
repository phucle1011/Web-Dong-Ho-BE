const nodemailer = require("nodemailer");
const moment = require('moment-timezone');
const UserModel = require('../../models/usersModel');
const AuctionModel = require('../../models/auctionsModel');
const ProductVariantModel = require('../../models/productVariantsModel');
const ProductModel = require('../../models/productsModel');
const AuctionBidModel = require('../../models/auctionBidsModel');

const { Op } = require('sequelize');

const otpStore = new Map();

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

class AuctionController {

  static async getBalance(req, res) {
    try {
      const userId = req.user.id;

      const user = await UserModel.findByPk(userId);
      if (!user) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng' });
      }

      return res.status(200).json({
        success: true,
        balance: user.balance || 0,
      });
    } catch (error) {
      console.error('Lỗi khi lấy balance:', error);
      return res.status(500).json({ success: false, message: 'Lỗi server' });
    }
  }

  static async requestEntryOTP(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, message: 'Thiếu thông tin người dùng' });
      }

      const user = await UserModel.findByPk(userId, { attributes: ['id', 'name', 'email', 'balance', 'failed_payment_count'] });
      if (!user) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng' });
      }

      if ((user.failed_payment_count || 0) >= 3) {
        return res.status(403).json({
          success: false,
          message: 'Bạn đã bị cấm đấu giá vì không thanh toán quá 3 lần.'
        });
      }

      const email = user.email || req.user.email;
      if (!email) {
        return res.status(400).json({ success: false, message: 'Không tìm thấy email người dùng' });
      }

      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = Date.now() + 10 * 60 * 1000;
      otpStore.set(userId, { code, expiresAt });

      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: email,
        subject: "Mã OTP vào phòng đấu giá",
        html: `
          <p>Xin chào ${user.name || ''},</p>
          <p>Mã xác thực vào phòng đấu giá của bạn là: <strong style="font-size:18px">${code}</strong></p>
          <p>Mã có hiệu lực trong 10 phút. Vui lòng không cung cấp với bất cứ ai!</p>
        `,
      });

      return res.status(200).json({
        success: true,
        message: `Đã gửi OTP đến email ${email}.`,
        expireAt: new Date(expiresAt).toISOString(),
      });
    } catch (error) {
      console.error('Lỗi gửi OTP vào phòng đấu giá:', error);
      return res.status(500).json({ success: false, message: 'Lỗi server khi gửi OTP' });
    }
  }

  static async verifyEntryOTP(req, res) {
    try {
      const userId = req.user?.id;
      const { otp } = req.body;

      if (!userId) {
        return res.status(401).json({ success: false, message: 'Thiếu thông tin người dùng' });
      }
      if (!otp) {
        return res.status(400).json({ success: false, message: 'Vui lòng nhập mã OTP' });
      }

      const record = otpStore.get(userId);
      if (!record) {
        return res.status(400).json({ success: false, message: 'Không tìm thấy mã OTP. Vui lòng yêu cầu lại.' });
      }

      if (Date.now() > record.expiresAt) {
        otpStore.delete(userId);
        return res.status(410).json({ success: false, message: 'Mã OTP đã hết hạn. Vui lòng yêu cầu lại.' });
      }

      if (String(otp) !== String(record.code)) {
        return res.status(400).json({ success: false, message: 'Mã OTP không đúng.' });
      }

      otpStore.delete(userId);
      return res.status(200).json({ success: true, message: 'Xác thực OTP thành công. Bạn có thể vào phòng đấu giá.' });
    } catch (error) {
      console.error('Lỗi xác thực OTP:', error);
      return res.status(500).json({ success: false, message: 'Lỗi server khi xác thực OTP' });
    }
  }

  static async get(req, res) {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const offset = (page - 1) * limit;

      const { searchTerm, startDate, endDate, status } = req.query;
      const whereClause = {};

      if (searchTerm) {
        whereClause.product_variant_id = {
          [Op.like]: `%${searchTerm}%`,
        };
      }

      if (startDate || endDate) {
        whereClause.start_time = {};
        if (startDate) {
          whereClause.start_time[Op.gte] = new Date(`${startDate}T00:00:00`);
        }
        if (endDate) {
          whereClause.start_time[Op.lte] = new Date(`${endDate}T23:59:59`);
        }
      }

      const allAuctions = await AuctionModel.findAll({
        where: whereClause,
        include: [
          {
            model: ProductVariantModel,
            as: "variant",
            include: [
              {
                model: ProductModel,
                as: "product"
              }
            ]
          }
        ]
      });

      const statusCounts = {
        all: allAuctions.length,
        upcoming: allAuctions.filter(a => a.status === "upcoming").length,
        active: allAuctions.filter(a => a.status === "active").length,
        ended: allAuctions.filter(a => a.status === "ended").length,
      };

      let filteredAuctions = allAuctions;
      if (status === "upcoming" || status === "active" || status === "ended") {
        filteredAuctions = allAuctions.filter(a => a.status === status);
      }

      const statusPriority = { active: 1, upcoming: 2, ended: 3 };

      filteredAuctions.sort((a, b) => {
        const priorityA = statusPriority[a.status] || 99;
        const priorityB = statusPriority[b.status] || 99;

        if (priorityA === priorityB) {
          return new Date(a.start_time) - new Date(b.start_time);
        }

        return priorityA - priorityB;
      });

      const paginatedAuctions = filteredAuctions.slice(offset, offset + limit);

      return res.status(200).json({
        status: 200,
        message: "Lấy danh sách phiên đấu giá thành công",
        data: paginatedAuctions,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(filteredAuctions.length / limit),
          totalItems: filteredAuctions.length,
        },
        statusCounts,
      });
    } catch (error) {
      console.error("Lỗi khi lấy danh sách đấu giá:", error);
      return res.status(500).json({ message: "Lỗi server, vui lòng thử lại sau!" });
    }
  }

  static async getBids(req, res) {
    try {
      const { auctionId } = req.params;

      const bids = await AuctionBidModel.findAll({
        where: { auction_id: auctionId },
        include: [
          { model: UserModel, as: 'user', attributes: ['id', 'name', 'email'] }
        ],
        order: [['created_at', 'DESC']],
      });

      const data = bids.map(b => ({
        id: b.id,
        user_id: b.user_id,
        user_name: b.user?.name || `User#${b.user_id}`,
        bidAmount: Number(b.bidAmount),
        bidTime: b.bidTime || b.created_at,
      }));

      return res.status(200).json({ success: true, data });
    } catch (error) {
      console.error('Lỗi khi lấy lịch sử đấu giá:', error);
      return res.status(500).json({ success: false, message: 'Lỗi server' });
    }
  }

  static async placeBid(req, res) {
    const t = await AuctionModel.sequelize.transaction();
    try {
      const { auctionId } = req.params;
      const userId = req.user.id;
      const amount = Number(req.body.bidAmount);

      if (amount <= 0) {
        await t.rollback();
        return res.status(400).json({ success: false, message: 'Giá đặt không hợp lệ' });
      }

      const auction = await AuctionModel.findByPk(auctionId, {
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      if (!auction) {
        await t.rollback();
        return res.status(404).json({ success: false, message: 'Không tìm thấy phiên đấu giá' });
      }

      const now = new Date();
      if (auction.status !== 'active' || new Date(auction.end_time) <= now) {
        await t.rollback();
        return res.status(400).json({ success: false, message: 'Phiên đấu giá đã kết thúc' });
      }

      const currentPrice = Number(auction.current_price ?? auction.start_price ?? 0);
      if (amount <= currentPrice) {
        await t.rollback();
        return res.status(400).json({ success: false, message: 'Giá đặt phải cao hơn giá hiện tại' });
      }

      const bid = await AuctionBidModel.create({
        auction_id: auctionId,
        user_id: userId,
        bidAmount: amount,
        bidTime: new Date(),
      }, { transaction: t });

      auction.current_price = amount;
      await auction.save({ transaction: t });

      await t.commit();

      const io = req.app.get('io');
      io.to(`auction:${auctionId}`).emit('bid:new', {
        auctionId: Number(auctionId),
        currentPrice: amount,
        highestBidUserId: userId,
        bid: {
          id: bid.id,
          user_id: userId,
          user_name: req.user.name || `User#${userId}`,
          bidAmount: amount,
          bidTime: bid.bidTime,
        }
      });

      return res.status(201).json({
        success: true,
        message: 'Đặt giá thành công',
        data: {
          id: bid.id,
          auction_id: bid.auction_id,
          user_id: bid.user_id,
          bidAmount: amount,
          bidTime: bid.bidTime,
          currentPrice: amount,
        },
      });
    } catch (err) {
      await t.rollback();
      console.error('Lỗi placeBid:', err);
      return res.status(500).json({ success: false, message: err.message || 'Lỗi server' });
    }
  }

}

module.exports = AuctionController;
