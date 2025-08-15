const { Op } = require('sequelize');
const AuctionModel = require('../../models/auctionsModel');
const AuctionBidModel = require('../../models/auctionBidsModel');
const CartDetail = require('../../models/cartDetailsModel');
const UserModel = require('../../models/usersModel');
const ProductVariantModel = require('../../models/productVariantsModel');
const ProductModel = require('../../models/productsModel');

const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

module.exports = (io) => {

  const finalizeAuction = async (auctionId) => {
    const t = await AuctionModel.sequelize.transaction();
    try {
      const auction = await AuctionModel.findOne({
        where: { id: auctionId },
        transaction: t,
        lock: t.LOCK.UPDATE,

      });
      if (!auction) {
        await t.rollback();
        return { ok: false, reason: 'AUCTION_NOT_FOUND' };
      }

      if (auction.status === 'ended') {
        await t.commit();
        return { ok: true, reason: 'ALREADY_ENDED' };
      }

      const topBid = await AuctionBidModel.findOne({
        where: { auction_id: auction.id },
        order: [
          ['bidAmount', 'DESC'],
          ['created_at', 'ASC'],
        ],
        transaction: t,
        lock: t.LOCK.UPDATE,
      });


      if (topBid) {
        await CartDetail.destroy({
          where: { product_variant_id: auction.product_variant_id },
          transaction: t,
        });

        try {
          await CartDetail.create({
            user_id: topBid.user_id,
            product_variant_id: auction.product_variant_id,
            quantity: 1,
          }, { transaction: t });
        } catch (err) {
          if (err.name !== 'SequelizeUniqueConstraintError') throw err;
        }

        auction.current_price = topBid.bidAmount;
        auction.status = 'ended';
        await auction.save({ transaction: t });
      } else {
        auction.status = 'ended';
        await auction.save({ transaction: t });
      }

      await t.commit();

      const user = await UserModel.findByPk(topBid.user_id);
      const userName = user?.name || 'Quý khách';

      const payload = {
        auctionId: auction.id,
        status: 'ended',
        winner: topBid ? {
          user_id: topBid.user_id,
          user_name: userName,
          bidAmount: Number(topBid.bidAmount),
          product_variant_id: auction.product_variant_id,
        } : null,
      };

      io.to(`auction:${auction.id}`).emit('auction:status', payload);

      if (topBid) io.to(`user:${topBid.user_id}`).emit('auction:win', payload);

      sendWinnerEmail(
        topBid.user_id,
        auction.id,
        Number(topBid.bidAmount)
      );

      io.emit('auction:status', payload);

      return { ok: true, winner: payload.winner };
    } catch (e) {
      await t.rollback();
      console.error('[Finalize Auction Error]', e);
      return { ok: false, reason: e.message };
    }
  };


  async function sendWinnerEmail(winnerId, auctionId, bidAmount) {
    try {
      const user = await UserModel.findByPk(winnerId);
      if (!user?.email) return;

      const auction = await AuctionModel.findByPk(auctionId, {
        include: [{
          model: ProductVariantModel,
          as: 'variant',
          include: [{ model: ProductModel, as: 'product' }]
        }]
      });
      const userName = user.name || 'Quý khách';
      const productName = auction.variant?.product?.name || 'sản phẩm';
      const sku = auction.variant?.sku || '';

      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: user.email,
        subject: "Chúc mừng bạn đã chiến thắng phiên đấu giá",
        html: `
        <p>Xin chào <strong>${userName}</strong>,</p>
        <p>Bạn đã chiến thắng phiên đấu giá <strong>${productName} (${sku})</strong> với giá <strong>${bidAmount.toLocaleString()} VND</strong>.</p>
        <p>Vui lòng thanh toán trước hạn
                                nếu không bạn sẽ bị trừ 10% số tiền thắng cược trong ví và nếu 3 lần không thanh toán
                                bạn sẽ bị cấm đấu giá vĩnh viễn!</p>
        <p>-- Hệ thống Đồng Hồ TimesMaster --</p>
      `
      });
    } catch (err) {
      console.error('Send winner email error:', err);
    }
  }

  setInterval(async () => {
    try {
      const now = new Date();

      const auctionsToActivate = await AuctionModel.findAll({
        where: { status: 'upcoming', start_time: { [Op.lte]: now } },
      });
      for (const auction of auctionsToActivate) {
        auction.status = 'active';
        await auction.save();

        const payload = {
          auctionId: auction.id,
          status: 'active',
          currentPrice: Number(auction.current_price ?? auction.start_price ?? 0),
        };
        io.to(`auction:${auction.id}`).emit('auction:status', payload);
        io.emit('auction:status', payload);
      }

      const auctionsToEnd = await AuctionModel.findAll({
        where: { status: 'active', end_time: { [Op.lte]: now } },
        attributes: ['id'],
      });
      for (const a of auctionsToEnd) {
        await finalizeAuction(a.id);
      }

      const expiredBids = await AuctionBidModel.findAll({
        where: {
          bidTime: {
            [Op.lte]: new Date(now.getTime() - 12 * 60 * 1000),
          },
        },
        include: [
          {
            model: AuctionModel,
            as: 'auction',
            attributes: ['product_variant_id'],
            required: true,
            where: {
              status: 'ended',
            },
          },
        ],
        attributes: ['user_id'],
      });

      if (expiredBids.length > 0) {
        const conditions = expiredBids
          .filter(bid => bid.auction?.product_variant_id)
          .map(bid => ({
            user_id: bid.user_id,
            product_variant_id: bid.auction.product_variant_id,
          }));

        // if (conditions.length > 0) {
        //   await CartDetail.destroy({
        //     where: {
        //       [Op.or]: conditions,
        //     },
        //   });
        // }
      }

    } catch (e) {
      console.error('Lỗi cron job:', e.message);
    }
  }, 1000);

};
