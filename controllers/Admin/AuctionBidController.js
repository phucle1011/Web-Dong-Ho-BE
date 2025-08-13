const AuctionModel = require("../../models/auctionsModel");
const AuctionBidModel = require("../../models/auctionBidsModel");
// const Auctions_Product = require("../../models/auctionsProductModel");
const { errorResponse, successResponse } = require("../../helpers/response");

class AuctionBidController {
  static async placeBid(req, res) {
    const { auctionId, bidAmount, userId } = req.body;

    if (!auctionId || !bidAmount || !userId) {
      return errorResponse(res, "Thiếu thông tin phiên đấu giá, giá thầu hoặc người dùng!", 400);
    }

    try {
      const auction = await AuctionModel.findByPk(auctionId, {
        include: {
          model: Auctions_Product,
          as: "auctionProduct"
        }
      });

      if (!auction) {
        return errorResponse(res, "Không tìm thấy phiên đấu giá!", 404);
      }

      const now = new Date();
      if (auction.status !== "active" || now < new Date(auction.start_time) || now > new Date(auction.end_time)) {
        return errorResponse(res, "Phiên đấu giá không còn hoạt động hoặc đã hết hạn!", 400);
      }

      const highestBid = await AuctionBidModel.findOne({
        where: { auction_id: auctionId },
        order: [["bidAmount", "DESC"]]
      });

      const currentPrice = highestBid ? Number(highestBid.bidAmount) : Number(auction.start_price);
      const priceStep = Number(auction.priceStep || 100000);

      if (highestBid && highestBid.user_id === userId) {
        return errorResponse(res, "Bạn đang là người giữ giá cao nhất. Hãy đợi người khác đặt giá trước!", 400);
      }

      if (Number(bidAmount) < currentPrice + priceStep) {
        return errorResponse(res, `Giá thầu phải lớn hơn hoặc bằng ${currentPrice + priceStep}`, 400);
      }

      await AuctionBidModel.create({
        auction_id: auctionId,
        user_id: userId,
        bidAmount,
        bidTime: new Date()
      });

      return successResponse(res, "Đặt giá thành công!", null, 200);
    } catch (err) {
      console.error(err);
      return errorResponse(res, "Lỗi server!", 500);
    }
  }
}

module.exports = AuctionBidController;
