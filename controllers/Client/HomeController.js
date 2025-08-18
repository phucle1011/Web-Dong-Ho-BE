const Product = require("../../models/productsModel");
const ProductVariant = require("../../models/productVariantsModel");
const PromotionModel = require("../../models/promotionsModel");
const PromotionProductModel = require("../../models/promotionProductsModel");
const VariantImagesModel = require("../../models/variantImagesModel");
const Brand = require("../../models/brandsModel");
const Category = require("../../models/categoriesModel");
const ProductVariantAttributeValuesModel = require("../../models/productVariantAttributeValuesModel");
const ProductAttributeModel = require("../../models/productAttributesModel");
const OrderDetail = require("../../models/orderDetailsModel");
const Comment = require("../../models/commentsModel");
const { Op, fn, col, literal, Sequelize } = require("sequelize");

class HomeController {
static async getAllNewProducts(req, res) {
  try {
    const now = new Date();

    const newProducts = await Product.findAll({
      where: {
        status: 1,
        publication_status: 'published',
      },
      include: [
        {
          model: Category,
          as: 'category',
          attributes: ['id', 'name', 'status'],
          required: true,
          where: { status: { [Op.or]: ['active', 'ACTIVE', 1, true] } },
        },
        {
          model: Brand,
          as: 'brand',
          attributes: ['id', 'name', 'status'],
          required: true,
          where: { status: { [Op.or]: ['active', 'ACTIVE', 1, true] } },
        },
        {
          model: ProductVariant,
          as: 'variants',
          required: true,
          attributes: ['id', 'price', 'stock', 'is_auction_only',"sku"],
          where: { is_auction_only: false },
          include: [
            {
              model: ProductVariantAttributeValuesModel,
              as: 'attributeValues',
              required: false,
              include: [{ model: ProductAttributeModel, as: 'attribute' }],
            },
            { model: VariantImagesModel, as: 'images', required: false },
            {
              model: PromotionProductModel,
              as: 'promotionProducts',
              required: false,
              attributes: ['id', 'variant_quantity'],
              include: [
                {
                  model: PromotionModel,
                  as: 'promotion',
                  required: false,
                  attributes: [
                    'id', 'code', 'name', 'discount_type', 'discount_value',
                    'quantity', 'start_date', 'end_date', 'status', 'max_price'
                  ],
                  where: {
                    status: { [Op.or]: ['active', 'ACTIVE', 1, true] },
                    start_date: { [Op.lte]: now },
                    end_date: { [Op.gte]: now },
                  },
                },
              ],
            },
          ],
        },
      ],
      attributes: ['id', 'name', 'thumbnail', 'createdAt','slug'],
      order: [['createdAt', 'DESC']],
      limit: 8,
    });

    // -- Tính rating theo variant
    const allVariantIds = newProducts.flatMap(p => p.variants?.map(v => v.id) || []);
    let ratingMap = {};
    if (allVariantIds.length > 0) {
      const ratingData = await Comment.findAll({
        where: { parent_id: null },
        include: [{
          model: OrderDetail,
          as: 'orderDetail',
          attributes: ['product_variant_id'],
          where: { product_variant_id: { [Op.in]: allVariantIds } },
          required: true,
        }],
        attributes: [
          [col('orderDetail.product_variant_id'), 'variantId'],
          [fn('AVG', col('rating')), 'avgRating'],
          [fn('COUNT', col('rating')), 'ratingCount'],
        ],
        group: ['orderDetail.product_variant_id'],
        raw: true,
      });

      ratingMap = ratingData.reduce((acc, r) => {
        acc[r.variantId] = {
          avgRating: parseFloat(r.avgRating || 0).toFixed(1),
          ratingCount: parseInt(r.ratingCount || 0, 10),
        };
        return acc;
      }, {});
    }

    // -- Gắn promotion + rating
    const result = newProducts.map(p => {
      const productJson = p.toJSON();
      productJson.created_at = productJson.createdAt;
      delete productJson.createdAt;

      const variants = productJson.variants || [];

      productJson.variantCount = variants.length;
      productJson.total_stock = variants.reduce((sum, v) => sum + (parseInt(v.stock) || 0), 0);

      for (const v of variants) {
        const price = parseFloat(v.price) || 0;

        const best = (v.promotionProducts || []).reduce((best, pp) => {
          const promo = pp.promotion;
          if (!promo) return best;
          if (pp.variant_quantity !== null && pp.variant_quantity <= 0) return best;

          const cap = promo.max_price != null
            ? Math.max(0, parseFloat(promo.max_price) || 0)
            : null;

          let discountAmount = 0;
          if (promo.discount_type === 'percentage') {
            const pct = Math.max(0, Math.min(100, parseFloat(promo.discount_value) || 0));
            const raw = price * (pct / 100);
            discountAmount = cap != null ? Math.min(raw, cap) : raw;
          } else if (promo.discount_type === 'fixed') {
            const fixed = Math.max(0, parseFloat(promo.discount_value) || 0);
            const raw = Math.min(fixed, price);
            discountAmount = cap != null ? Math.min(raw, cap) : raw;
          }

          discountAmount = Math.min(discountAmount, price);
          const finalPrice = Math.max(0, price - discountAmount);
          const percent = price > 0 ? (discountAmount / price) * 100 : 0;

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

        const lowest = best?.discounted_price ?? price;
        const percent = best?.discount_percent ?? 0;

        v.promotion = best || {
          discounted_price: lowest,
          discount_percent: percent,
          discount_amount: 0,
          meets_conditions: false,
        };

        const rating = ratingMap[v.id] || { avgRating: '0.0', ratingCount: 0 };
        v.averageRating = rating.avgRating;
        v.ratingCount = rating.ratingCount;
      }

      return productJson;
    });

    return res.status(200).json({
      status: 200,
      message: 'Lấy danh sách sản phẩm mới thành công!',
      data: result,
      pagination: {
        currentPage: 1,
        limit: 8,
        totalPages: 1,
        totalProducts: result.length,
      },
      totalVariants: result.reduce((s, p) => s + (p.variants?.length || 0), 0),
    });
  } catch (error) {
    console.error('[getAllNewProducts] ERROR:', error);
    return res.status(500).json({ status: 500, message: 'Lỗi máy chủ khi lấy sản phẩm mới!' });
  }
}







static async getTopSoldProducts(req, res) {
  try {
    const now = new Date();

    // 1) Lấy top 20 variant bán chạy
    const variantSales = await OrderDetail.findAll({
      attributes: ['product_variant_id', [fn('SUM', col('quantity')), 'totalSold']],
      group: ['product_variant_id'],
      order: [[literal('totalSold'), 'DESC']],
      limit: 20,
      raw: true,
    });

    const variantIds = variantSales.map(it => it.product_variant_id);

    // 2) Lấy các variant liên quan kèm sản phẩm
    const variants = await ProductVariant.findAll({
      where: {
        id: { [Op.in]: variantIds },
        is_auction_only: false
      },
      include: [
        {
          model: Product,
          as: 'product',
          attributes: ['id', 'name', 'thumbnail', 'createdAt','slug'],
        }
      ]
    });

    // Gom theo product và tính tổng sold
    const productMap = new Map();
    for (const v of variants) {
      const product = v.product;
      if (!product) continue;

      const totalSold = parseInt(
        variantSales.find(s => s.product_variant_id === v.id)?.totalSold || 0
      );

      if (!productMap.has(product.id)) {
        productMap.set(product.id, {
          ...product.toJSON(),
          totalSold,
        });
      } else {
        productMap.get(product.id).totalSold += totalSold;
      }
    }

    const topProducts = Array.from(productMap.values())
      .sort((a, b) => b.totalSold - a.totalSold)
      .slice(0, 10);

    // 3) Enrich sản phẩm đầy đủ
    const enriched = await Promise.all(
      topProducts.map(async (prod) => {
        const fullProduct = await Product.findOne({
          where: {
            id: prod.id,
            status: 1,
            publication_status: 'published'
          },
          attributes: ['id', 'name', 'thumbnail', 'createdAt','slug'],
          include: [
            {
              model: Category,
              as: 'category',
              attributes: ['id', 'name', 'status'],
              where: { status: 'active' },
              required: true,
            },
            {
              model: Brand,
              as: 'brand',
              attributes: ['id', 'name', 'status'],
              where: { status: 'active' },
              required: true,
            },
            {
              model: ProductVariant,
              as: 'variants',
              where: { is_auction_only: false },
              attributes: ['id', 'price', 'stock','sku'],
              include: [
                { model: VariantImagesModel, as: 'images', attributes: ['id', 'image_url'] },
                {
                  model: PromotionProductModel,
                  as: 'promotionProducts',
                  include: [
                    {
                      model: PromotionModel,
                      as: 'promotion',
                      required: false,
                      where: {
                        status: 'active',
                        start_date: { [Op.lte]: now },
                        end_date: { [Op.gte]: now },
                      },
                      attributes: [
                        'id', 'code', 'name', 'discount_type', 'discount_value',
                        'quantity', 'start_date', 'end_date', 'max_price'
                      ]
                    }
                  ]
                }
              ]
            }
          ]
        });

        if (!fullProduct) return null;

        const productJson = fullProduct.toJSON();
        productJson.created_at = productJson.createdAt;
        delete productJson.createdAt;

        // Tính rating
        const variants = productJson.variants || [];
        const vIds = variants.map(v => v.id);
        const ratingData = vIds.length > 0 ? await Comment.findAll({
          where: { parent_id: null },
          include: [
            {
              model: OrderDetail,
              as: 'orderDetail',
              attributes: ['product_variant_id'],
              where: { product_variant_id: { [Op.in]: vIds } },
              required: true,
            }
          ],
          attributes: [
            [col('orderDetail.product_variant_id'), 'variantId'],
            [fn('AVG', col('rating')), 'avgRating'],
            [fn('COUNT', col('rating')), 'ratingCount']
          ],
          group: ['orderDetail.product_variant_id'],
          raw: true
        }) : [];

        const ratingMap = {};
        for (const item of ratingData) {
          ratingMap[item.variantId] = {
            avgRating: parseFloat(item.avgRating || 0).toFixed(1),
            ratingCount: parseInt(item.ratingCount || 0, 10)
          };
        }

        // Tính promo + rating cho từng variant
        for (const v of variants) {
          const price = parseFloat(v.price) || 0;

          const best = (v.promotionProducts || []).reduce((best, pp) => {
            const promo = pp.promotion;
            if (!promo) return best;
            if (pp.variant_quantity !== null && pp.variant_quantity <= 0) return best;

            const cap = promo.max_price != null
              ? Math.max(0, parseFloat(promo.max_price) || 0)
              : null;

            let discountAmount = 0;
            if (promo.discount_type === 'percentage') {
              const pct = Math.max(0, Math.min(100, parseFloat(promo.discount_value) || 0));
              discountAmount = price * (pct / 100);
              if (cap != null) discountAmount = Math.min(discountAmount, cap);
            } else if (promo.discount_type === 'fixed') {
              const fixed = Math.max(0, parseFloat(promo.discount_value) || 0);
              discountAmount = Math.min(fixed, price);
              if (cap != null) discountAmount = Math.min(discountAmount, cap);
            }

            discountAmount = Math.min(discountAmount, price);
            const finalPrice = Math.max(0, price - discountAmount);
            const percent = price > 0 ? (discountAmount / price) * 100 : 0;

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

          const lowest = best?.discounted_price ?? price;
          const percent = best?.discount_percent ?? 0;

          v.promotion = best || {
            discounted_price: lowest,
            discount_percent: percent,
            discount_amount: 0,
            meets_conditions: false
          };

          const rating = ratingMap[v.id] || { avgRating: '0.0', ratingCount: 0 };
          v.averageRating = rating.avgRating;
          v.ratingCount = rating.ratingCount;
        }

        productJson.variants = variants;
        productJson.variantCount = variants.length;
        productJson.total_stock = variants.reduce((sum, v) => sum + (parseInt(v.stock) || 0), 0);

        return productJson;
      })
    );

    const filtered = enriched.filter(Boolean);
    return res.status(200).json(filtered);
  } catch (error) {
    console.error('Lỗi getTopSoldProducts:', error);
    return res.status(500).json({ message: 'Lỗi máy chủ', error: error.message });
  }
}






// Nhớ ở đầu file:
// const { Op, fn, col } = require('sequelize');

static async getDiscountedProducts(req, res) {
  try {
    const now = new Date();

   const discountedVariants = await ProductVariant.findAll({
  where: {
    is_auction_only: false
  },
  include: [
    {
      model: Product,
      as: 'product',
      where: { status: 1, publication_status: 'published' },
      attributes: ['id', 'name', 'thumbnail', 'createdAt','slug'],
      include: [
        {
          model: Category,
          as: 'category',
          attributes: ['id', 'name', 'status'],
          where: { status: 'active' },
          required: true,
        },
        {
          model: Brand,
          as: 'brand',
          attributes: ['id', 'name', 'status'],
          where: { status: 'active' },
          required: true,
        },
      ],
    },
    {
      model: VariantImagesModel,
      as: 'images',
      attributes: ['id', 'image_url'],
    },
    {
      model: PromotionProductModel,
      as: 'promotionProducts',
      required: true,
      where: {
        [Op.or]: [
          { variant_quantity: null },
          { variant_quantity: { [Op.gt]: 0 } },
        ],
      },
      attributes: ['id', 'variant_quantity', 'promotion_id', 'product_variant_id'],
      include: [
        {
          model: PromotionModel,
          as: 'promotion',
          where: {
            status: 'active',
            start_date: { [Op.lte]: now },
            end_date: { [Op.gte]: now },
          },
          required: true,
          attributes: [
            'id', 'name', 'code', 'discount_type', 'discount_value',
            'start_date', 'end_date', 'max_price', 'quantity',
          ],
        },
      ],
    },
  ],
});


    // --- Rating theo variant ---
    const variantIds = discountedVariants.map(v => v.id);
    const ratingData = variantIds.length
      ? await Comment.findAll({
          where: { parent_id: null },
          include: [
            {
              model: OrderDetail,
              as: 'orderDetail',
              attributes: ['product_variant_id'],
              where: { product_variant_id: { [Op.in]: variantIds } },
              required: true,
            },
          ],
          attributes: [
            [col('orderDetail.product_variant_id'), 'variantId'],
            [fn('AVG', col('rating')), 'avgRating'],
            [fn('COUNT', col('rating')), 'ratingCount'],
          ],
          group: ['orderDetail.product_variant_id'],
          raw: true,
        })
      : [];

    const ratingMap = {};
    for (const item of ratingData) {
      ratingMap[item.variantId] = {
        avgRating: Number(parseFloat(item.avgRating || 0).toFixed(1)),
        ratingCount: parseInt(item.ratingCount || 0, 10),
      };
    }

    // --- Gom theo product + chọn promo tốt nhất ---
    const productMap = new Map();

    for (const variant of discountedVariants) {
      const product = variant.product;
      if (!product) continue;

      const variantPrice = Math.max(0, parseFloat(variant.price) || 0);

      // Chọn promotion tốt nhất trong danh sách của biến thể
      const bestPromotion = (variant.promotionProducts || []).reduce((best, pp) => {
        const promo = pp.promotion;
        if (!promo) return best;

        const cap = promo.max_price != null
          ? Math.max(0, parseFloat(promo.max_price) || 0)
          : null;

        let discountAmount = 0;
        if (promo.discount_type === 'percentage') {
          const pct = Math.max(0, Math.min(100, parseFloat(promo.discount_value) || 0));
          const raw = variantPrice * (pct / 100);
          discountAmount = cap != null ? Math.min(raw, cap) : raw;
        } else if (promo.discount_type === 'fixed') {
          const fixed = Math.max(0, parseFloat(promo.discount_value) || 0);
          const raw = Math.min(fixed, variantPrice); // Không giảm quá giá gốc
          discountAmount = cap != null ? Math.min(raw, cap) : raw;
        }

        discountAmount = Math.max(0, Math.min(discountAmount, variantPrice));
        const finalPrice = Math.max(0, variantPrice - discountAmount);
        const percent = variantPrice > 0 ? (discountAmount / variantPrice) * 100 : 0;

        // ✅ Điều kiện còn lượt: cả cấp biến thể & cấp mã
        const meets =
          (pp.variant_quantity == null || pp.variant_quantity > 0) &&
          (promo.quantity == null || promo.quantity > 0);

        const info = {
          id: promo.id,
          code: promo.code,
          name: promo.name,
          discount_type: promo.discount_type,
          discount_value: Number(promo.discount_value),
          start_date: promo.start_date,
          end_date: promo.end_date,
          max_price: promo.max_price != null ? Number(promo.max_price) : null,
          discounted_price: Number(finalPrice.toFixed(2)),
          discount_amount: Number(discountAmount.toFixed(2)),
          discount_percent: Number(percent.toFixed(2)),
          meets_conditions: meets,
          // ✅ để FE hiển thị
          variant_quantity_left: pp.variant_quantity, 
        };

        if (!best) return info;

        // Ưu tiên giá sau giảm thấp hơn
        if (info.meets_conditions && !best.meets_conditions) return info;
        if (!info.meets_conditions && best.meets_conditions) return best;

        if (info.discounted_price < best.discounted_price) return info;
        if (info.discounted_price > best.discounted_price) return best;

        // Tie-breaker 1: discount_amount lớn hơn
        if (info.discount_amount > best.discount_amount) return info;
        if (info.discount_amount < best.discount_amount) return best;

        // Tie-breaker 2: end_date sớm hơn (khuyến mãi "nóng" hơn)
        const aEnd = new Date(info.end_date).getTime();
        const bEnd = new Date(best.end_date).getTime();
        if (aEnd < bEnd) return info;
        if (aEnd > bEnd) return best;

        return best;
      }, null);

      const variantJson = variant.toJSON();

      // Gắn thông tin khuyến mãi đã tính
      if (bestPromotion) {
        variantJson.promotion = bestPromotion;
      } else {
        variantJson.promotion = {
          discounted_price: variantPrice,
          discount_percent: 0,
          discount_amount: 0,
          meets_conditions: false,
        };
      }

      // Gắn rating
      const rating = ratingMap[variant.id] || { avgRating: 0.0, ratingCount: 0 };
      variantJson.averageRating = rating.avgRating;
      variantJson.ratingCount = rating.ratingCount;

      // Gom theo product
      if (!productMap.has(product.id)) {
        productMap.set(product.id, {
  id: product.id,
  slug: product.slug, // ✅ thêm dòng này
  name: product.name,
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
    console.error('Lỗi khi lấy sản phẩm giảm giá:', error);
    return res.status(500).json({ message: 'Lỗi server khi lấy sản phẩm giảm giá' });
  }
}





}
module.exports = HomeController;

