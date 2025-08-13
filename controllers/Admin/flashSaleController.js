const NotificationModel = require("../../models/notificationsModel");
const FlashSaleModel = require("../../models/FlashSaleModel");
const PromotionModel = require("../../models/promotionsModel");
const PromotionProductModel = require("../../models/promotionProductsModel");

const { Op, fn, col } = require("sequelize");

class FlashSaleController {
  // ✅ Lấy danh sách tất cả Flash Sale
  static async getAll(req, res) {
    try {
      const { page = 1, limit = 10, search = "" } = req.query;
      const offset = (page - 1) * limit;

      const whereClause = search
        ? { title: { [Op.like]: `%${search}%` } }
        : {};

      const { count, rows } = await NotificationModel.findAndCountAll({
        where: whereClause,
        include: [
          {
            model: FlashSaleModel,
            as: "flashSale",
            include: [{ model: PromotionModel, as: "promotion", required: true }]
          }
        ],
        order: [["id", "DESC"]],
        limit: parseInt(limit),
        offset: parseInt(offset)
      });

      res.status(200).json({
        success: true,
        data: rows,
        pagination: {
          total: count,
          page: parseInt(page),
          totalPages: Math.ceil(count / limit)
        }
      });
    } catch (error) {
      console.error("Lỗi khi lấy danh sách flash sale:", error);
      res.status(500).json({ success: false, message: "Lỗi máy chủ" });
    }
  }

  // ✅ Lấy danh sách các promotion chưa gắn FlashSale
  static async getActiveProductPromotions(req, res) {
    try {
      const promotions = await PromotionModel.findAll({
        where: {
          applicable_to: "product",
          status: ["active", "upcoming"],
          "$flashSale.id$": null
        },
        attributes: {
          include: [
            [fn("COUNT", col("promotionProducts.product_variant_id")), "variant_count"]
          ]
        },
        include: [
          { model: PromotionProductModel, as: "promotionProducts", attributes: [] },
          { model: FlashSaleModel, as: "flashSale", required: false, attributes: [] }
        ],
        group: ["Promotion.id"],
        order: [["created_at", "DESC"]]
      });

      res.status(200).json({ success: true, data: promotions });
    } catch (error) {
      console.error("Lỗi khi lấy khuyến mãi:", error);
      res.status(500).json({ success: false, message: "Lỗi máy chủ" });
    }
  }

  // ✅ Tạo Flash Sale mới
  static async create(req, res) {
    try {
      const { promotion_id, thumbnail, title, start_date, end_date, status } = req.body;
      if (!promotion_id || !thumbnail || !title || !start_date || !end_date) {
        return res.status(400).json({ success: false, message: "Thiếu thông tin cần thiết." });
      }

      const promotionIds = Array.isArray(promotion_id) ? promotion_id : [promotion_id];
      const validIds = promotionIds.map(id => parseInt(id)).filter(id => !isNaN(id));

      if (!validIds.length) {
        return res.status(400).json({ success: false, message: "promotion_id không hợp lệ." });
      }

      const notification = await NotificationModel.create({
        thumbnail,
        title,
        status,
        start_date,
        end_date
      });

      const createdFlashSales = [];
      for (const pid of validIds) {
        const exists = await FlashSaleModel.findOne({ where: { promotion_id: pid } });
        if (exists) continue;
        const flashSale = await FlashSaleModel.create({
          notification_id: notification.id,
          promotion_id: pid
        });
        createdFlashSales.push(flashSale);
      }

      if (!createdFlashSales.length) {
        return res.status(409).json({
          success: false,
          message: "Tất cả chương trình đã được liên kết với Flash Sale."
        });
      }

      res.status(201).json({ success: true, data: createdFlashSales });
    } catch (error) {
      console.error("Lỗi khi tạo flash sale:", error);
      res.status(500).json({ success: false, message: "Lỗi máy chủ" });
    }
  }

  // ✅ Lấy chi tiết 1 flash sale (cho form edit)
  static async getById(req, res) {
    try {
      const { id } = req.params;
      const notification = await NotificationModel.findOne({
        where: { id },
        include: [
          {
            model: FlashSaleModel,
            as: "flashSale",
            include: [{ model: PromotionModel, as: "promotion" }]
          }
        ]
      });

      if (!notification) {
        return res.status(404).json({ success: false, message: "Không tìm thấy thông báo." });
      }

      res.status(200).json({ success: true, data: notification });
    } catch (error) {
      console.error("Lỗi khi lấy chi tiết flash sale:", error);
      res.status(500).json({ success: false, message: "Lỗi máy chủ" });
    }
  }

  // ✅ Cập nhật thông báo và flash sale
  static async update(req, res) {
    try {
      const { id } = req.params;
      const { title, thumbnail, promotion_id, start_date, end_date, status } = req.body;

      const notification = await NotificationModel.findByPk(id);
      if (!notification) {
        return res.status(404).json({ success: false, message: "Không tìm thấy thông báo." });
      }

      await notification.update({ title, thumbnail, start_date, end_date, status });

      await FlashSaleModel.destroy({ where: { notification_id: id } });

      const flashSales = promotion_id.map(pid => ({
        notification_id: id,
        promotion_id: pid
      }));

      await FlashSaleModel.bulkCreate(flashSales);

      res.status(200).json({ success: true, message: "Cập nhật thành công!" });
    } catch (error) {
      console.error("Lỗi khi cập nhật:", error);
      res.status(500).json({ success: false, message: "Lỗi máy chủ" });
    }
  }

  // ✅ Xoá 1 flash sale (và notification liên quan)
 static async delete(req, res) {
  try {
    const notificationId = req.params.id;

    // 1. Kiểm tra notification có tồn tại không
    const notification = await NotificationModel.findByPk(notificationId);
    if (!notification) {
      return res.status(404).json({ success: false, message: "Không tìm thấy thông báo (notification)." });
    }

    
    // 3. Sau đó xoá tất cả flash sales liên quan
    await FlashSaleModel.destroy({ where: { notification_id: notificationId } });
    // 2. Xoá notification trước
    await NotificationModel.destroy({ where: { id: notificationId } });


    return res.status(200).json({
      success: true,
      message: `Đã xoá notification (${notificationId}) và các flash sales liên quan.`,
    });
  } catch (error) {
    console.error("Lỗi khi xoá notification + flash sales:", error);
    return res.status(500).json({ success: false, message: "Lỗi máy chủ" });
  }
}

}

module.exports = FlashSaleController;
