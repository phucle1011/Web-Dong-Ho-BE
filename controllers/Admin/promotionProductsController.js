const { Op, Sequelize } = require("sequelize");
const ProductVariantsModel = require("../../models/productVariantsModel");
const ProductModel = require("../../models/productsModel");
const PromotionProductModel = require("../../models/promotionProductsModel");
const PromotionModel = require("../../models/promotionsModel");
const sequelize = require("../../config/database");

class PromotionProductController {
  static async getAll(req, res) {
    const { searchTerm = "", page = 1, limit = 10, promotion_id } = req.query;
    const pageNumber = parseInt(page, 10);
    const pageSize = parseInt(limit, 10);

    try {
      const whereCondition = {};
      if (searchTerm) {
        whereCondition[Op.or] = [
          { "$variant.product.name$": { [Op.like]: `%${searchTerm}%` } },
          { "$promotion.name$": { [Op.like]: `%${searchTerm}%` } },
          { "$variant.sku$": { [Op.like]: `%${searchTerm}%` } },
          { "$promotion.status$": { [Op.like]: `%${searchTerm}%` } },
        ];
      }
      if (promotion_id) {
        whereCondition.promotion_id = parseInt(promotion_id, 10);
      }

      const allRows = await PromotionProductModel.findAll({
        where: whereCondition,
        include: [
          {
            model: ProductVariantsModel,
            as: "variant",
            attributes: ["id", "sku", "price", "stock"],
            include: [
              { model: ProductModel, as: "product", attributes: ["name"] },
            ],
            required: false,
          },
          {
            model: PromotionModel,
            as: "promotion",
            attributes: {
              include: [
                "id",
                "name",
                "start_date",
                "end_date",
                "discount_value",
                "discount_type",

                [
                  Sequelize.literal(
                    "(SELECT COUNT(DISTINCT pp.product_variant_id) FROM promotion_products AS pp WHERE pp.promotion_id = promotion.id AND pp.product_variant_id IS NOT NULL)"
                  ),
                  "variant_count",
                ],
              ],
            },
          },
        ],
        order: [["promotion", "id", "ASC"]],
        subQuery: false,
      });

      // Nhóm theo promotion_id
      const grouped = {};
      let totalVariantQuantity = 0;

      allRows.forEach((item) => {
        const promoId = item.promotion?.id;
        if (!promoId) return;

        if (!grouped[promoId]) {
          grouped[promoId] = {
            items: [],
            totalVariantQuantity: 0,
          };
        }

        grouped[promoId].items.push(item);
        grouped[promoId].totalVariantQuantity += item.variant_quantity || 0;

        // Tính tổng variant quantity cho tất cả promotions
        totalVariantQuantity += item.variant_quantity || 0;
      });

      const promoIds = Object.keys(grouped).map((id) => parseInt(id, 10));
      const totalPromotions = promoIds.length;
      const totalPages = Math.ceil(totalPromotions / pageSize);

      const startIndex = (pageNumber - 1) * pageSize;
      const pagePromoIds = promoIds.slice(startIndex, startIndex + pageSize);

      // Tạo mảng rows hiển thị trong trang hiện tại
      const rows = pagePromoIds.flatMap((promoId) => grouped[promoId].items);

      // Nếu muốn, bạn có thể gửi kèm map tổng số lượt mỗi promotion:
      const variantQuantityByPromotion = {};
      pagePromoIds.forEach((promoId) => {
        variantQuantityByPromotion[promoId] =
          grouped[promoId].totalVariantQuantity;
      });

      return res.json({
        data: rows,
        totalVariantQuantity,
        variantQuantityByPromotion, // optional: để frontend hiển thị từng promotion
        pagination: {
          total: totalPromotions,
          page: pageNumber,
          limit: pageSize,
          totalPages,
        },
      });
    } catch (err) {
      console.error("Error fetching promotion_products:", err);
      return res.status(500).json({ error: err.message });
    }
  }

  static async getById(req, res) {
    try {
      const id = req.params.id;
      const data = await PromotionProductModel.findByPk(id, {
        include: [
          {
            model: ProductVariantsModel,
            as: "variant",
            attributes: ["sku", "price", "stock"],
            include: [
              {
                model: ProductModel,
                as: "product",
                attributes: ["name"],
              },
            ],
          },
          {
            model: PromotionModel,
            as: "promotion",
            attributes: ["name", "start_date", "end_date", "status"],
          },
        ],
      });

      if (!data) {
        return res.status(404).json({ message: "Promotion product not found" });
      }

      res.json(data);
    } catch (err) {
      console.error("Error in getById:", err);
      res.status(500).json({ error: err.message });
    }
  }

  static async create(req, res) {
    try {
      const { product_variant_id, promotion_id, variant_quantity } = req.body;

      const variantIds = Array.isArray(product_variant_id)
        ? product_variant_id
        : [product_variant_id];
      const promotionIds = Array.isArray(promotion_id)
        ? promotion_id
        : [promotion_id];
      const variantQuantities = Array.isArray(variant_quantity)
        ? variant_quantity
        : [variant_quantity];

      if (variantIds.length === 0 || promotionIds.length === 0) {
        return res
          .status(400)
          .json({
            error: "Vui lòng cung cấp ít nhất 1 promotion và 1 product_variant",
          });
      }

      if (
        variantIds.some((id) => isNaN(id) || id <= 0) ||
        promotionIds.some((id) => isNaN(id) || id <= 0)
      ) {
        return res
          .status(400)
          .json({ error: "ID khuyến mãi hoặc biến thể không hợp lệ" });
      }

      if (variantQuantities.length !== variantIds.length) {
        return res
          .status(400)
          .json({ error: "variant_quantity phải tương ứng từng biến thể" });
      }

      if (variantQuantities.some((q) => isNaN(q) || q <= 0)) {
        return res
          .status(400)
          .json({ error: "Tất cả variant_quantity phải là số > 0" });
      }

      const variants = await ProductVariantsModel.findAll({
        where: { id: variantIds },
        include: [
          {
            model: ProductModel,
            as: "product",
            attributes: ["id", "publication_status"],
            where: { publication_status: "published" },
          },
        ],
      });

      if (variants.length !== variantIds.length) {
        const foundVariantIds = variants.map((v) => v.id);
        const missingIds = variantIds.filter(
          (id) => !foundVariantIds.includes(id)
        );
        return res.status(400).json({
          error: `Các biến thể không hợp lệ hoặc thuộc sản phẩm chưa xuất bản: ${missingIds.join(
            ", "
          )}`,
        });
      }

      const promotions = await PromotionModel.findAll({
        where: { id: promotionIds },
      });
      if (promotions.length !== promotionIds.length) {
        const missingIds = promotionIds.filter(
          (id) => !promotions.some((p) => p.id === id)
        );
        return res
          .status(400)
          .json({
            error: `Các khuyến mãi không tồn tại: ${missingIds.join(", ")}`,
          });
      }

      // Kiểm tra tồn kho biến thể
      for (let i = 0; i < variantIds.length; i++) {
        const variantId = parseInt(variantIds[i]);
        const quantity = parseInt(variantQuantities[i]);
        const variant = variants.find((v) => v.id === variantId);

        if (!variant) {
          return res
            .status(400)
            .json({ error: `Không tìm thấy biến thể với ID ${variantId}` });
        }

        const totalForVariant = quantity * promotionIds.length;

        if (totalForVariant > variant.stock) {
          return res.status(400).json({
            error: `Tổng số lượng áp dụng (${totalForVariant}) vượt quá tồn kho (${variant.stock}) của biến thể SKU ${variant.sku}`,
          });
        }
      }

      // TÍNH TỔNG SỐ LƯỢNG ĐÃ PHÂN BỔ CHO MỖI BIẾN THỂ (mọi khuyến mãi trước đó)
      const allocRows = await PromotionProductModel.findAll({
        where: { product_variant_id: variantIds },
        attributes: [
          "product_variant_id",
          [sequelize.fn("SUM", sequelize.col("variant_quantity")), "used_qty"],
        ],
        group: ["product_variant_id"],
        raw: true,
      });

      const usedByVariant = {};
      allocRows.forEach((r) => {
        const vid = parseInt(r.product_variant_id);
        const used = parseInt(r.used_qty) || 0;
        usedByVariant[vid] = used;
      });

      // KIỂM TRA TỒN KHO VÀ KHẢ NĂNG PHÂN BỔ
      for (let i = 0; i < variantIds.length; i++) {
        const variantId = parseInt(variantIds[i]);
        const quantityPerPromo = parseInt(variantQuantities[i]); // số lượng/khuyến mãi cho biến thể này
        const variant = variants.find((v) => v.id === variantId);

        if (!variant) {
          return res
            .status(400)
            .json({ error: `Không tìm thấy biến thể với ID ${variantId}` });
        }

        // 1) Hết hàng thì chặn
        if (!variant.stock || variant.stock <= 0) {
          return res.status(400).json({
            error: `Biến thể SKU ${variant.sku} đã hết hàng (stock = 0). Không thể thêm vào khuyến mãi.`,
          });
        }

        // 2) Tổng yêu cầu (vì có thể thêm cùng lúc vào nhiều promotion)
        const requestedTotal = quantityPerPromo * promotionIds.length;

        // 3) Đã dùng trước đó ở các khuyến mãi khác
        const used = usedByVariant[variantId] || 0;

        // 4) Nếu vượt quá stock => chặn (báo số còn lại)
        if (used + requestedTotal > variant.stock) {
          const remaining = Math.max(0, variant.stock - used);
          return res.status(400).json({
            error:
              `Số lượng yêu cầu (${requestedTotal}) cho biến thể SKU ${variant.sku} vượt quá tồn kho (${variant.stock}). ` +
              `Đã phân bổ trước đó: ${used}. Số còn có thể phân bổ thêm: ${remaining}.`,
          });
        }
      }

      // Tạo payload
      const payloads = [];
      for (const promoId of promotionIds) {
        for (let i = 0; i < variantIds.length; i++) {
          payloads.push({
            promotion_id: parseInt(promoId),
            product_variant_id: parseInt(variantIds[i]),
            variant_quantity: parseInt(variantQuantities[i]),
          });
        }
      }

      // LẤY TẤT CẢ PHÂN BỔ HIỆN HỮU CHO NHỮNG BIẾN THỂ NÀY KÈM KHOẢNG THỜI GIAN KM
      const existAllocWithPromos = await PromotionProductModel.findAll({
        where: { product_variant_id: variantIds },
        include: [
          {
            model: PromotionModel,
            as: "promotion",
            attributes: ["id", "name", "start_date", "end_date"],
          },
        ],
      });

      // map nhanh variantId -> variant (để lấy sku/name cho thông báo)
      const variantById = new Map(variants.map((v) => [v.id, v]));

      // tiện ích kiểm tra chồng thời gian [aStart,aEnd] với [bStart,bEnd]
      const overlaps = (aStart, aEnd, bStart, bEnd) => {
        if (!aStart || !aEnd || !bStart || !bEnd) return false;
        return (
          new Date(aStart) <= new Date(bEnd) &&
          new Date(bStart) <= new Date(aEnd)
        );
      };

      // gom promotions mới theo id để tra cứu
      const newPromoById = new Map(promotions.map((p) => [p.id, p]));

      // TỔNG HỢP CONFLICTS
      const timeConflicts = [];
      for (const variantIdRaw of variantIds) {
        const variantId = parseInt(variantIdRaw);
        const v = variantById.get(variantId);
        const sku = v?.sku || `variant#${variantId}`;

        // các phân bổ hiện hữu của biến thể này
        const existRows = existAllocWithPromos.filter(
          (r) => parseInt(r.product_variant_id) === variantId
        );

        for (const promoIdRaw of promotionIds) {
          const promoId = parseInt(promoIdRaw);
          const newPromo = newPromoById.get(promoId);
          if (!newPromo) continue;

          // bỏ qua so với chính nó (trường hợp thêm thêm biến thể cho cùng 1 KM)
          for (const row of existRows) {
            if (parseInt(row.promotion_id) === promoId) continue;

            const other = row.promotion; // có start_date, end_date
            if (
              overlaps(
                newPromo.start_date,
                newPromo.end_date,
                other.start_date,
                other.end_date
              )
            ) {
              timeConflicts.push({
                variantId,
                sku,
                newPromotionId: promoId,
                newPromotionRange: [newPromo.start_date, newPromo.end_date],
                conflictPromotionId: other.id,
                conflictPromotionName: other.name,
                conflictRange: [other.start_date, other.end_date],
              });
            }
          }
        }
      }

      if (timeConflicts.length > 0) {
        // gộp message gọn gàng để toast
        const msg = timeConflicts
          .map(
            (c) =>
              `SKU ${c.sku} trùng thời gian với KM #${c.conflictPromotionId} (${c.conflictPromotionName}) ` +
              `(${new Date(c.conflictRange[0]).toLocaleString()} → ${new Date(
                c.conflictRange[1]
              ).toLocaleString()})`
          )
          .join("; ");
        return res.status(400).json({
          error:
            `Không thể gán vì chồng thời gian khuyến mãi: ${msg}. ` +
            `Vui lòng đảm bảo KM mới bắt đầu sau khi KM kia kết thúc.`,
        });
      }

      // Kiểm tra trùng lặp
      const existingRecords = await PromotionProductModel.findAll({
        where: {
          promotion_id: promotionIds,
          product_variant_id: variantIds,
        },
      });

      const existingPairs = new Set(
        existingRecords.map(
          (item) => `${item.promotion_id}-${item.product_variant_id}`
        )
      );

      const filteredPayloads = payloads.filter(
        (p) => !existingPairs.has(`${p.promotion_id}-${p.product_variant_id}`)
      );

      if (filteredPayloads.length === 0) {
        return res
          .status(409)
          .json({ error: "Tất cả các cặp promotion-product đã tồn tại" });
      }

      // Kiểm tra tổng số biến thể không vượt quá promotion.quantity
      await sequelize.transaction(async (t) => {
        const groupedByPromo = {};

        for (const item of filteredPayloads) {
          if (!groupedByPromo[item.promotion_id])
            groupedByPromo[item.promotion_id] = [];
          groupedByPromo[item.promotion_id].push(item);
        }

        for (const [promoId, items] of Object.entries(groupedByPromo)) {
          const promo = promotions.find((p) => p.id === parseInt(promoId));
          const totalVariants = items.length;

          if (totalVariants > promo.quantity) {
            throw new Error(
              `Số biến thể (${totalVariants}) vượt quá số lượng còn lại (${promo.quantity}) của khuyến mãi ${promoId}`
            );
          }
        }

        // Lưu dữ liệu
        await PromotionProductModel.bulkCreate(filteredPayloads, {
          transaction: t,
        });
      });

      const data = await PromotionProductModel.findAll({
        where: { promotion_id: promotionIds },
        include: [
          { model: PromotionModel, as: "promotion" },
          { model: ProductVariantsModel, as: "variant" },
        ],
      });

      return res
        .status(201)
        .json({ message: "Thêm promotion-product thành công", data });
    } catch (err) {
      console.error("Error in create:", {
        message: err.message,
        stack: err.stack,
        payload: req.body,
      });
      return res
        .status(500)
        .json({ error: err.message || "Lỗi khi thêm sản phẩm khuyến mãi" });
    }
  }

  static async update(req, res) {
    const t = await sequelize.transaction();
    try {
      const { promotion_id, products } = req.body;

      // 0) Validate payload
      if (!promotion_id || !Array.isArray(products) || products.length === 0) {
        await t.rollback();
        return res.status(400).json({ message: "Thiếu thông tin cập nhật." });
      }

      // 1) Promotion
      const promo = await PromotionModel.findByPk(promotion_id, {
        transaction: t,
      });
      if (!promo) {
        await t.rollback();
        return res.status(404).json({ message: "Promotion không tồn tại." });
      }

      // Kiểm tra số lượng biến thể không vượt quá promo.quantity
      if (promo.quantity !== null && promo.quantity !== undefined) {
        if (products.length > promo.quantity) {
          await t.rollback();
          return res.status(400).json({
            message: `Số biến thể (${products.length}) vượt quá số lượng tối đa cho phép (${promo.quantity}).`,
          });
        }
      }

      // 2) Chuẩn hóa dữ liệu products
      const variantIds = products.map((p) => Number(p.product_variant_id));
      const quantities = products.map((p) => Number(p.variant_quantity));

      if (
        variantIds.some((id) => !Number.isFinite(id) || id <= 0) ||
        quantities.some((q) => !Number.isFinite(q) || q < 0)
      ) {
        await t.rollback();
        return res
          .status(400)
          .json({ message: "ID biến thể phải > 0 và số lượng phải ≥ 0." });
      }
      const rows = products
        .map((item) => ({
          promotion_id,
          product_variant_id: Number(item.product_variant_id),
          variant_quantity: Number(item.variant_quantity),
        }))
        .filter((row) => row.variant_quantity >= 0); // giữ 0 nếu muốn “đánh dấu hết lượt”
      await PromotionProductModel.destroy({
        where: { promotion_id },
        transaction: t,
      });
      await PromotionProductModel.bulkCreate(rows, { transaction: t });

      // 3) Lấy variants (kèm Product published)
      const variants = await ProductVariantsModel.findAll({
        where: { id: variantIds },
        include: [
          {
            model: ProductModel,
            as: "product",
            attributes: ["id", "publication_status"],
            required: true,
            where: { publication_status: "published" },
          },
        ],
        attributes: ["id", "stock", "price", "sku"],
        transaction: t,
      });

      if (variants.length !== variantIds.length) {
        const foundIds = variants.map((v) => v.id);
        const missing = variantIds.filter((id) => !foundIds.includes(id));
        await t.rollback();
        return res.status(400).json({
          message: `Các biến thể không hợp lệ hoặc thuộc sản phẩm chưa xuất bản: ${missing.join(
            ", "
          )}`,
        });
      }

      // Map id -> info
      const vm = {};
      variants.forEach((v) => {
        vm[v.id] = {
          stock: Number(v.stock || 0),
          price: Number.parseFloat(v.price || 0),
          sku: v.sku || "N/A",
        };
      });

      // 4) Validate từng item: tồn kho, finalPrice > 0, min_price_threshold
      for (const item of products) {
        const vid = Number(item.product_variant_id);
        const qty = Number(item.variant_quantity);

        const v = vm[vid];
        if (!v) {
          await t.rollback();
          return res
            .status(400)
            .json({ message: `Không tìm thấy biến thể ID ${vid}.` });
        }

        // 4a) Stock
        if (qty > v.stock) {
          await t.rollback();
          return res.status(400).json({
            message: `Số lượt áp dụng (${qty}) vượt quá tồn kho (${v.stock}) cho SKU ${v.sku}.`,
          });
        }

        // 4b) min_price_threshold (nếu có)
        if (promo.min_price_threshold != null) {
          const minThreshold = Number(promo.min_price_threshold);
          if (Number.isFinite(minThreshold) && v.price < minThreshold) {
            await t.rollback();
            return res.status(400).json({
              message: `SKU ${v.sku} có giá (${v.price.toLocaleString(
                "vi-VN"
              )}₫) nhỏ hơn ngưỡng tối thiểu (${minThreshold.toLocaleString(
                "vi-VN"
              )}₫).`,
            });
          }
        }

        // 4c) finalPrice > 0 theo loại discount
        if (promo.discount_type === "percentage") {
          const finalPrice =
            v.price * (1 - Number(promo.discount_value || 0) / 100);
          if (finalPrice <= 0) {
            await t.rollback();
            return res.status(400).json({
              message: `Sau khi giảm ${promo.discount_value}% biến thể SKU ${v.sku} có giá <= 0.`,
            });
          }
        } else if (promo.discount_type === "fixed") {
          const finalPrice = v.price - Number(promo.discount_value || 0);
          if (finalPrice <= 0) {
            await t.rollback();
            return res.status(400).json({
              message: `Giảm cố định ${promo.discount_value}₫ làm SKU ${v.sku} có giá <= 0.`,
            });
          }
        }
      }

      // 5) Cập nhật promotion_products: xóa hết & tạo mới
      await PromotionProductModel.destroy({
        where: { promotion_id },
        transaction: t,
      });

      await PromotionProductModel.bulkCreate(
        products.map((item) => ({
          promotion_id,
          product_variant_id: Number(item.product_variant_id),
          variant_quantity: Number(item.variant_quantity),
        })),
        { transaction: t }
      );

      await t.commit();

      return res.status(200).json({
        message: "Cập nhật khuyến mãi thành công!",
        totalApplied: products.length,
      });
    } catch (err) {
      await t.rollback();
      console.error("Lỗi khi cập nhật khuyến mãi:", err);
      return res.status(500).json({ message: err.message || "Có lỗi xảy ra." });
    }
  }

  static async delete(req, res) {
    const { id } = req.params;

    try {
      const transaction = await sequelize.transaction();

      try {
        const promotionProduct = await PromotionProductModel.findByPk(id, {
          transaction,
        });

        if (!promotionProduct) {
          await transaction.rollback();
          return res
            .status(404)
            .json({ message: "Không tìm thấy bản ghi khuyến mãi." });
        }

        await promotionProduct.destroy({ transaction });

        await transaction.commit();

        return res.status(200).json({ message: "Xóa khuyến mãi thành công!" });
      } catch (error) {
        await transaction.rollback();
        throw error;
      }
    } catch (error) {
      console.error("Lỗi khi xóa bản ghi khuyến mãi:", error);
      return res
        .status(500)
        .json({ message: "Xóa thất bại: " + error.message });
    }
  }

  static async getAllPromotion(req, res) {
    try {
      const now = new Date();

      const promotionProducts = await PromotionModel.findAll({
        where: {
          status: {
            [Op.in]: ["active", "upcoming"],
          },
          applicable_to: "product",
        },
      });

      res.status(200).json({
        success: true,
        data: promotionProducts,
      });
    } catch (error) {
      console.error("Lỗi khi lấy danh sách promotion:", error.message);
      res.status(500).json({
        success: false,
        message: "Lỗi máy chủ.",
      });
    }
  }
}

module.exports = PromotionProductController;
