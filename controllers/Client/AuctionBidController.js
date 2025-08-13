const AuctionBidModel = require("../../models/auctionBidsModel");
const AuctionsModel = require("../../models/auctionsModel");
const ProductVariantsModel = require("../../models/productVariantsModel");

// Dùng Map để lưu thời gian đặt giá gần nhất theo auction_id
const auctionCooldownMap = new Map();

class AuctionBidController {
  static async placeBid(req, res) {
    try {
      const { auction_id, bidAmount, user_id } = req.body;

      if (!auction_id || !bidAmount || !user_id) {
        return res.status(400).json({ message: 'auction_id, bidAmount và user_id là bắt buộc' });
      }

      const now = Date.now();

      // Kiểm tra nếu phiên đấu giá đang trong thời gian chờ
      const lastBidTime = auctionCooldownMap.get(auction_id);
      if (lastBidTime && now - lastBidTime < 60 * 1000) {
        const secondsLeft = Math.ceil((60 * 1000 - (now - lastBidTime)) / 1000);
        return res.status(429).json({
          message: `Phiên đấu giá này đang tạm khóa. Vui lòng thử lại sau ${secondsLeft} giây.`,
        });
      }

      const auction = await AuctionsModel.findByPk(auction_id);
      if (!auction || auction.status !== 'active') {
        return res.status(400).json({ message: 'Phiên đấu giá không hợp lệ hoặc không còn hoạt động' });
      }

      const variant = await ProductVariantsModel.findByPk(auction.product_variant_id);
      if (!variant || !variant.price) {
        return res.status(400).json({ message: 'Không tìm thấy giá khởi điểm từ sản phẩm đấu giá' });
      }

      const highestBid = await AuctionBidModel.findOne({
        where: { auction_id },
        order: [['bidAmount', 'DESC']],
      });

      if (highestBid && highestBid.user_id === user_id) {
        return res.status(400).json({
          message: 'Bạn đang là người đặt giá cao nhất, không thể đặt tiếp',
        });
      }

      const minBid = highestBid
        ? Number(highestBid.bidAmount) + Number(auction.priceStep)
        : Number(variant.price);

      if (Number(bidAmount) < minBid) {
        return res.status(400).json({
          message: `Giá phải lớn hơn hoặc bằng ${minBid}`,
        });
      }

      const newBid = await AuctionBidModel.create({
        auction_id,
        user_id,
        bidAmount,
        bidTime: new Date(),
      });

      // ✅ Cập nhật thời gian đặt giá gần nhất
      auctionCooldownMap.set(auction_id, now);

      return res.status(201).json({
        message: 'Đặt giá thành công',
        bid: newBid,
      });
    } catch (error) {
      console.error('Lỗi khi đặt giá:', error);
      return res.status(500).json({ message: 'Lỗi server' });
    }
  }
}

module.exports = AuctionBidController;
