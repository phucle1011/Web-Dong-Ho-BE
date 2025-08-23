const { Op, Sequelize } = require("sequelize");
const ProductVariantsModel = require("../../models/productVariantsModel");
const ProductModel = require("../../models/productsModel");
const PromotionProductModel = require("../../models/promotionProductsModel");
const PromotionModel = require("../../models/promotionsModel");
const OrderDetailModel = require("../../models/orderDetailsModel");
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
 // KIỂM TRA TỔNG variant_quantity THEO PROMOTION KHÔNG VƯỢT QUÁ promotion.quantity
await sequelize.transaction(async (t) => {
  // 1) Nhóm các payload theo promotion_id
  const groupedByPromo = {};
  for (const item of filteredPayloads) {
    if (!groupedByPromo[item.promotion_id]) groupedByPromo[item.promotion_id] = [];
    groupedByPromo[item.promotion_id].push(item);
  }

  // 2) Lấy tổng đã phân bổ trước đó cho các promotion liên quan, khóa hàng để tránh race
  const allocByPromoRows = await PromotionProductModel.findAll({
    where: { promotion_id: Object.keys(groupedByPromo).map((id) => parseInt(id)) },
    attributes: [
      'promotion_id',
      [sequelize.fn('SUM', sequelize.col('variant_quantity')), 'used_qty'],
    ],
    group: ['promotion_id'],
    raw: true,
    transaction: t,
    lock: t.LOCK.UPDATE, // đảm bảo an toàn khi nhiều request cùng lúc
  });

  const usedByPromo = {};
  allocByPromoRows.forEach((r) => {
    usedByPromo[parseInt(r.promotion_id)] = parseInt(r.used_qty) || 0;
  });

  // 3) Với mỗi promotion, tính tổng yêu cầu mới và so sánh với quota (quantity) còn lại
  for (const [promoIdStr, items] of Object.entries(groupedByPromo)) {
    const promoId = parseInt(promoIdStr);

    // tổng variant_quantity đang yêu cầu cho promotion này
    const requestedQty = items.reduce((sum, it) => sum + (parseInt(it.variant_quantity) || 0), 0);

    // promo lấy từ danh sách promotions đã query phía trên
    const promo = promotions.find((p) => p.id === promoId);
    if (!promo) {
      throw new Error(`Không tìm thấy khuyến mãi #${promoId}`);
    }

    

    const usedQty = usedByPromo[promoId] || 0;
    const remaining = Math.max(0, (parseInt(promo.quantity) || 0) - usedQty);

    if (requestedQty > remaining) {
      throw new Error(
        `Tổng số lượt yêu cầu (${requestedQty}) vượt quá số lượt còn lại (${remaining}) của khuyến mãi #${promoId}`
      );
    }
  }

  // 4) Lưu dữ liệu vì tất cả promotion đều còn đủ quota
  await PromotionProductModel.bulkCreate(filteredPayloads, { transaction: t });
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
console.log("Payload rđeceived:", { promotion_id, products });
    // 0) Validate payload
    if (!promotion_id || !Array.isArray(products) || products.length === 0) {
      await t.rollback();
      return res.status(400).json({ message: "Thiếu thông tin cập nhật." });
    }

    // 1) Lấy promotion và kiểm tra
    const promo = await PromotionModel.findByPk(promotion_id, {
      transaction: t,
      lock: t.LOCK.UPDATE,
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
    const rows = products.map((p) => ({
      promotion_id: Number(promotion_id),
      product_variant_id: Number(p.product_variant_id),
      variant_quantity: Number(p.variant_quantity),
    }));

    const variantIds = rows.map((p) => p.product_variant_id);
    const quantities = rows.map((p) => p.variant_quantity);

    if (
      variantIds.some((id) => !Number.isFinite(id) || id <= 0) ||
      quantities.some((q) => !Number.isFinite(q) || q <= 0)
    ) {
      await t.rollback();
      return res.status(400).json({ message: "ID biến thể hoặc số lượng không hợp lệ." });
    }

    // Kiểm tra trùng lặp biến thể trong payload
    const variantIdCounts = {};
    rows.forEach((r) => {
      variantIdCounts[r.product_variant_id] = (variantIdCounts[r.product_variant_id] || 0) + 1;
    });
    const duplicates = Object.entries(variantIdCounts)
      .filter(([_, count]) => count > 1)
      .map(([id]) => id);
    if (duplicates.length > 0) {
      await t.rollback();
      return res.status(400).json({
        message: `Payload chứa biến thể trùng lặp: ${duplicates.join(", ")}`,
      });
    }

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
      lock: t.LOCK.UPDATE,
    });

    if (variants.length !== variantIds.length) {
      const foundIds = variants.map((v) => v.id);
      const missing = variantIds.filter((id) => !foundIds.includes(id));
      await t.rollback();
      return res.status(400).json({
        message: `Các biến thể không hợp lệ hoặc thuộc sản phẩm chưa xuất bản: ${missing.join(", ")}`,
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
    for (const item of rows) {
      const vid = item.product_variant_id;
      const qty = item.variant_quantity;
      const v = vm[vid];
      if (!v) {
        await t.rollback();
        return res.status(400).json({ message: `Không tìm thấy biến thể ID ${vid}.` });
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
            message: `SKU ${v.sku} có giá (${v.price.toLocaleString("vi-VN")}₫) nhỏ hơn ngưỡng tối thiểu (${minThreshold.toLocaleString("vi-VN")}₫).`,
          });
        }
      }

      // 4c) finalPrice > 0 theo loại discount
      if (promo.discount_type === "percentage") {
        const finalPrice = v.price * (1 - Number(promo.discount_value || 0) / 100);
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

    // 5) Lấy tất cả promotion_products hiện có cho promotion này
    const existingRecords = await PromotionProductModel.findAll({
      where: { promotion_id },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    // 6) Kiểm tra tổng quota của promotion
    const totalRequested = rows.reduce((sum, r) => sum + r.variant_quantity, 0);
    const promoQuota = Number(promo.quantity) || Infinity; // Nếu promo.quantity là null/undefined, bỏ qua giới hạn
    if (totalRequested > promoQuota) {
      await t.rollback();
      return res.status(400).json({
        message: `Tổng số lượt yêu cầu (${totalRequested}) vượt quá số lượt tối đa (${promoQuota}) của khuyến mãi.`,
        remaining: Math.max(0, promoQuota - totalRequested),
      });
    }

    // 7) Sync thông minh: Update/Create/Delete
    const newVariantIds = new Set(rows.map((r) => r.product_variant_id));
    const existingVariantIds = new Set(existingRecords.map((rec) => rec.product_variant_id));

    // 7.1) Update hoặc Create mới
    for (const newRow of rows) {
      const existing = existingRecords.find(
        (rec) => rec.product_variant_id === newRow.product_variant_id
      );

      if (existing) {
        // Kiểm tra số lượt đã sử dụng trong order_details
        const usedQty = await OrderDetailModel.sum("promotion_applied_qty", {
          where: { promotion_product_id: existing.id },
          transaction: t,
        }) || 0;

        if (newRow.variant_quantity < usedQty) {
          await t.rollback();
          return res.status(400).json({
            message: `Số lượt mới (${newRow.variant_quantity}) nhỏ hơn số lượt đã sử dụng (${usedQty}) cho biến thể SKU ${vm[newRow.product_variant_id].sku}.`,
          });
        }

        // Update nếu đã tồn tại
        existing.variant_quantity = newRow.variant_quantity;
        await existing.save({ transaction: t });
      } else {
        // Create mới nếu chưa có
        await PromotionProductModel.create(newRow, { transaction: t });
      }
    }

    // 7.2) Delete các variant bị loại bỏ (nhưng check foreign key trước)
    const toDelete = existingRecords.filter((rec) => !newVariantIds.has(rec.product_variant_id));

    for (const rec of toDelete) {
      // Kiểm tra xem có order_details tham chiếu không
      const hasOrders = await OrderDetailModel.count({
        where: { promotion_product_id: rec.id },
        transaction: t,
      });

      if (hasOrders > 0) {
        await t.rollback();
        const variant = vm[rec.product_variant_id] || { sku: `ID ${rec.product_variant_id}` };
        return res.status(409).json({
          message: `Không thể xóa biến thể SKU ${variant.sku} (ID ${rec.product_variant_id}) vì đã có đơn hàng sử dụng (promotion_product_id: ${rec.id}).`,
        });
      } else {
        // An toàn thì xóa
        await rec.destroy({ transaction: t });
      }
    }

    // 8) Kiểm tra lại tổng số lượt sau sync
    const afterSumRow = await PromotionProductModel.findOne({
      where: { promotion_id },
      attributes: [[sequelize.fn("SUM", sequelize.col("variant_quantity")), "total_qty"]],
      raw: true,
      transaction: t,
    });

    const afterSum = Number(afterSumRow?.total_qty || 0);
    if (afterSum > promoQuota) {
      await t.rollback();
      return res.status(409).json({
        message: `Tổng số lượt sau cập nhật (${afterSum}) vượt quá quota (${promoQuota}). Đã hủy thay đổi.`,
      });
    }

    await t.commit();
    return res.status(200).json({
      message: "Cập nhật khuyến mãi thành công!",
      totalApplied: rows.length,
      totalRequested: afterSum,
      quota: promoQuota,
      remaining: Math.max(0, promoQuota - afterSum),
    });
  } catch (err) {
    await t.rollback();
    console.error("Lỗi khi cập nhật khuyến mãi:", err);
    return res.status(500).json({ message: err.message || "Có lỗi xảy ra." });
  }
}
  static async delete(req, res) {
  const { id } = req.params;
  const t = await sequelize.transaction();

  try {
    const promotionProduct = await PromotionProductModel.findByPk(id, {
      transaction: t,
    });

    if (!promotionProduct) {
      await t.rollback();
      return res.status(404).json({ message: "Không tìm thấy bản ghi khuyến mãi." });
    }

    // Kiểm tra xem có order_details tham chiếu không
    const hasOrders = await OrderDetailModel.count({
      where: { promotion_product_id: id },
      transaction: t,
    });

    if (hasOrders > 0) {
      await t.rollback();
      return res.status(409).json({
        message: `Không thể xóa bản ghi khuyến mãi (ID ${id}) vì đã có đơn hàng sử dụng.`,
      });
    }

    await promotionProduct.destroy({ transaction: t });
    await t.commit();
    return res.status(200).json({ message: "Xóa khuyến mãi thành công!" });
  } catch (error) {
    await t.rollback();
    console.error("Lỗi khi xóa bản ghi khuyến mãi:", error);
    return res.status(500).json({ message: "Xóa thất bại: " + error.message });
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
