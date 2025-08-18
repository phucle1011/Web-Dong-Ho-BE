const NotificationModel = require("../../models/notificationsModel");
const OrderDetail = require("../../models/orderDetailsModel");
const Comment = require("../../models/commentsModel");
const Notification_promotionsModel = require("../../models/FlashSaleModel");
const PromotionModel = require("../../models/promotionsModel");
const PromotionProductModel = require("../../models/promotionProductsModel");
const VariantImagesModel = require("../../models/variantImagesModel");
const Product = require("../../models/productsModel");
const ProductVariant = require("../../models/productVariantsModel");
const ProductVariantAttributeValuesModel = require("../../models/productVariantAttributeValuesModel");
const ProductAttributeModel = require("../../models/productAttributesModel");
const { Op, fn, col } = require("sequelize");

class FlashSaleController {
  // ✅ Lấy tất cả flash sale đang hoạt động
static async getAll(req, res) {
  try {
    const now = new Date();

    const notifications = await NotificationModel.findAll({
      where: {
        status: 1,
        // Nếu muốn lọc theo ngày hiện tại đang hiệu lực:
        // start_date: { [Op.lte]: now },
        // end_date: { [Op.gte]: now },
      },
      attributes: [
        'id',
        'title',
        'thumbnail', // ✅ đảm bảo dòng này có
        'status',
        'start_date',
        'end_date',
        'created_at',
      ],
      include: [
        {
          model: Notification_promotionsModel,
          as: "notification_promotions",
          required: false,
          include: [
            {
              model: PromotionModel,
              as: "promotion",
              where: {
                status: "active",
                start_date: { [Op.lte]: now },
                end_date: { [Op.gte]: now },
              },
              required: true,
            },
          ],
        },
      ],
      order: [["id", "DESC"]],
    });

    res.status(200).json({ success: true, data: notifications });
  } catch (error) {
    console.error("Lỗi khi lấy danh sách flash sale theo notification:", error);
    res.status(500).json({ success: false, message: "Lỗi máy chủ" });
  }
}

static async getDiscountedProductsByNotificationId(req, res) {
  try {
    const now = new Date();
    const notificationId = req.params.notification_id;

    if (!notificationId) {
      return res.status(400).json({ message: "Thiếu notification_id" });
    }

    const notificationPromotions = await Notification_promotionsModel.findAll({
      where: { notification_id: notificationId },
    });

    if (!notificationPromotions || notificationPromotions.length === 0) {
      return res.status(404).json({ message: "Không tìm thấy Flash Sale nào" });
    }

    const promotionIds = notificationPromotions.map(fs => fs.promotion_id);

    const promotionWhere = {
      status: "active",
      start_date: { [Op.lte]: now },
      end_date: { [Op.gte]: now },
      id: { [Op.in]: promotionIds },
    };

    const discountedVariants = await ProductVariant.findAll({
      where: { is_auction_only: false },
      include: [
        {
          model: Product,
          as: "product",
          where: { status: 1, publication_status: "published" },
          attributes: ["id", "name", "thumbnail","slug", "createdAt"],
        },
        {
          model: VariantImagesModel,
          as: "images",
          attributes: ["id", "image_url"],
        },
        {
          model: PromotionProductModel,
          as: "promotionProducts",
          required: true,
          where: {
            [Op.or]: [
              { variant_quantity: null },
              { variant_quantity: { [Op.gt]: 0 } },
            ],
          },
          attributes: ['id', 'variant_quantity'],
          include: [
            {
              model: PromotionModel,
              as: "promotion",
              where: promotionWhere,
              required: true,
              attributes: [
                "id", "name", "code", "discount_type", "discount_value",
                "start_date", "end_date", "max_price", "quantity"
              ],
            },
          ],
        },
      ],
    });

    const variantIds = discountedVariants.map(v => v.id);

    const ratingData = variantIds.length
      ? await Comment.findAll({
          where: { parent_id: null },
          include: [
            {
              model: OrderDetail,
              as: "orderDetail",
              attributes: ["product_variant_id"],
              where: { product_variant_id: { [Op.in]: variantIds } },
              required: true,
            },
          ],
          attributes: [
            [col("orderDetail.product_variant_id"), "variantId"],
            [fn("AVG", col("rating")), "avgRating"],
            [fn("COUNT", col("rating")), "ratingCount"],
          ],
          group: ["orderDetail.product_variant_id"],
          raw: true,
        })
      : [];

    const ratingMap = {};
    for (const item of ratingData) {
      ratingMap[item.variantId] = {
        avgRating: parseFloat(item.avgRating || 0).toFixed(1),
        ratingCount: parseInt(item.ratingCount || 0, 10),
      };
    }

    const productMap = new Map();

    for (const variant of discountedVariants) {
      const product = variant.product;
      if (!product) continue;

      const variantPrice = parseFloat(variant.price) || 0;

      const bestPromotion = (variant.promotionProducts || []).reduce((best, pp) => {
        const promo = pp.promotion;
        if (!promo) return best;
        if (pp.variant_quantity !== null && pp.variant_quantity <= 0) return best;

        const cap = promo.max_price != null
          ? Math.max(0, parseFloat(promo.max_price) || 0)
          : null;

        let discountAmount = 0;

        if (promo.discount_type === "percentage") {
          const pct = Math.max(0, Math.min(100, parseFloat(promo.discount_value) || 0));
          const raw = variantPrice * (pct / 100);
          discountAmount = cap != null ? Math.min(raw, cap) : raw;
        } else if (promo.discount_type === "fixed") {
          const fixed = Math.max(0, parseFloat(promo.discount_value) || 0);
          const raw = Math.min(fixed, variantPrice);
          discountAmount = cap != null ? Math.min(raw, cap) : raw;
        }

        discountAmount = Math.min(discountAmount, variantPrice);
        const finalPrice = Math.max(0, variantPrice - discountAmount);
        const percent = variantPrice > 0 ? (discountAmount / variantPrice) * 100 : 0;

        const info = {
          id: promo.id,
          code: promo.code,
          name: promo.name,
          discount_type: promo.discount_type,
          discount_value: parseFloat(promo.discount_value),
          start_date: promo.start_date,
          end_date: promo.end_date,
          max_price: promo.max_price != null ? Number(promo.max_price) : null,
          discounted_price: Number(finalPrice.toFixed(2)),
          discount_amount: Number(discountAmount.toFixed(2)),
          discount_percent: Number(percent.toFixed(2)),
          meets_conditions: promo.quantity == null || promo.quantity > 0,
          variant_quantity_left: pp.variant_quantity
        };

        if (!best || (info.meets_conditions && info.discounted_price < best.discounted_price)) {
          return info;
        }
        return best;
      }, null);

      const variantJson = variant.toJSON();

      const lowest = bestPromotion?.discounted_price ?? variantPrice;
      const percent = bestPromotion?.discount_percent ?? 0;

      variantJson.promotion = bestPromotion || {
        discounted_price: lowest,
        discount_percent: percent,
        discount_amount: 0,
        meets_conditions: false,
      };

      const rating = ratingMap[variant.id] || { avgRating: "0.0", ratingCount: 0 };
      variantJson.averageRating = rating.avgRating;
      variantJson.ratingCount = rating.ratingCount;

      if (!productMap.has(product.id)) {
        productMap.set(product.id, {
          id: product.id,
          name: product.name,
          slug: product.slug,
          thumbnail: product.thumbnail,
          created_at: product.createdAt,
          variants: [variantJson],
          total_stock: parseInt(variant.stock) || 0,
          variantCount: 1,
        });
      } else {
        const p = productMap.get(product.id);
        p.variants.push(variantJson);
        p.total_stock += parseInt(variant.stock) || 0;
        p.variantCount += 1;
      }
    }

    const result = Array.from(productMap.values());

    return res.status(200).json(result);
  } catch (error) {
    console.error("Lỗi khi lấy sản phẩm giảm giá theo notification:", error);
    return res.status(500).json({ message: "Lỗi server khi xử lý yêu cầu" });
  }
}






}

module.exports = FlashSaleController;
