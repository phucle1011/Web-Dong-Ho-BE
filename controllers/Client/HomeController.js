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
        // Category phải active
        {
          model: Category,
          as: 'category',
          attributes: ['id', 'name', 'status'],
          required: true,
          where: { status: { [Op.or]: ['active', 'ACTIVE', 1, true] } },
        },
        // Brand phải active
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
          attributes: ['id', 'price', 'stock', 'is_auction_only'],
          where: { is_auction_only: 0 },
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
              include: [
                {
                  model: PromotionModel,
                  as: 'promotion',
                  required: false,
                  attributes: [
                    'id','code','name','discount_type','discount_value',
                    'quantity','start_date','end_date','status','max_price' // 👈 lấy thêm max_price
                  ],
                  where: {
                    status: { [Op.or]: ['active', 'ACTIVE', 1, true] },
                    start_date: { [Op.lte]: now },
                    end_date:   { [Op.gte]: now },
                  },
                },
              ],
            },
          ],
        },
      ],
      attributes: ['id', 'name', 'thumbnail', 'createdAt'],
      order: [['createdAt', 'DESC']],
      limit: 8,
    });

    // Thu thập variantIds để tính rating (nếu có)
    const allVariantIds = newProducts.flatMap(p => p.variants?.map(v => v.id) || []);
    let ratingMap = {};
    if (allVariantIds.length) {
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

    // Gắn promotion tốt nhất (có trần max_price) + rating
    const productsWithDetails = newProducts.map(p => {
      const productJson = p.toJSON();
      const variants = productJson.variants || [];

      productJson.variantCount = variants.length;
      productJson.total_stock = variants.reduce((sum, v) => sum + (parseInt(v.stock) || 0), 0);

      variants.forEach(v => {
        const price = parseFloat(v.price) || 0;

       const best = (v.promotionProducts || []).reduce((best, pp) => {
  const promo = pp.promotion;
  if (!promo) return best;

  // ✅ Bỏ qua nếu variant_quantity = 0
  if (pp.variant_quantity !== null && pp.variant_quantity <= 0) {
    return best;
  }

  const cap = promo.max_price != null
    ? Math.max(0, parseFloat(promo.max_price) || 0)
    : null;

  let discountAmount = 0;

  if (promo.discount_type === 'percentage') {
    const pct = Math.max(0, Math.min(100, parseFloat(promo.discount_value) || 0));
    const raw = price * (pct / 100);
    discountAmount = (cap != null) ? Math.min(raw, cap) : raw;
  } else if (promo.discount_type === 'fixed') {
    const fixed = Math.max(0, parseFloat(promo.discount_value) || 0);
    const raw = Math.min(fixed, price); // không trừ quá giá gốc
    discountAmount = (cap != null) ? Math.min(raw, cap) : raw;
  }

  const finalPrice = Math.max(0, price - discountAmount);
  const percent = price > 0 ? (discountAmount / price) * 100 : 0;

  const info = {
    id: promo.id,
    code: promo.code,
    discount_type: promo.discount_type,
    discount_value: parseFloat(promo.discount_value) || 0,
    discounted_price: parseFloat(finalPrice.toFixed(2)),
    discount_percent: parseFloat(percent.toFixed(2)),
    meets_conditions: promo.quantity == null || promo.quantity > 0,
  };

  if (!best || (info.meets_conditions && info.discounted_price < best.discounted_price)) {
    return info;
  }
  return best;
}, null);


        v.promotion = best || {
          discounted_price: price,
          discount_percent: 0,
          meets_conditions: true,
        };

        const rating = ratingMap[v.id] || { avgRating: '0.0', ratingCount: 0 };
        v.averageRating = rating.avgRating;
        v.ratingCount = rating.ratingCount;
      });

      return productJson;
    });

    const totalVariants = productsWithDetails.reduce((s, p) => s + (p.variants?.length || 0), 0);

    return res.status(200).json({
      status: 200,
      message: 'Lấy danh sách sản phẩm mới thành công!',
      data: productsWithDetails,
      pagination: { currentPage: 1, limit: 8, totalPages: 1, totalProducts: productsWithDetails.length },
      totalVariants,
    });
  } catch (error) {
    console.error('[getAllNewProducts] ERROR:', error);
    return res.status(500).json({ status: 500, message: 'Lỗi máy chủ khi lấy sản phẩm mới!' });
  }
}






static async getTopSoldProducts(req, res) {
  try {
    // 1) Lấy top variant bán chạy
    const variantSales = await OrderDetail.findAll({
      attributes: ['product_variant_id', [fn('SUM', col('quantity')), 'totalSold']],
      group: ['product_variant_id'],
      order: [[literal('totalSold'), 'DESC']],
      limit: 20,
      raw: true,
    });

    const variantIds = variantSales.map(it => it.product_variant_id);

    // 2) Map product từ list variant
    const variants = await ProductVariant.findAll({
      where: { id: { [Op.in]: variantIds } },
      include: [{ model: Product, as: 'product' }],
    });

    const productMap = new Map();
    for (const v of variants) {
      const product = v.product;
      if (!product) continue;

      const totalSold = parseInt(
        variantSales.find(s => s.product_variant_id === v.id)?.totalSold || 0
      );

      if (productMap.has(product.id)) {
        productMap.get(product.id).totalSold += totalSold;
      } else {
        productMap.set(product.id, { ...product.toJSON(), totalSold });
      }
    }

    const topProducts = Array.from(productMap.values())
      .sort((a, b) => b.totalSold - a.totalSold)
      .slice(0, 10);

    // 3) Lấy thông tin chi tiết cho topProducts (lọc category/brand active)
    const now = new Date();

    const enrichedTopProducts = await Promise.all(
      topProducts.map(async (prod) => {
        const fullProduct = await Product.findOne({
          where: { id: prod.id, status: 1, publication_status: 'published' },
          attributes: ['id', 'name', 'thumbnail', 'created_at'],
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
              attributes: ['id', 'price', 'stock', 'is_auction_only'],
              where: { is_auction_only: 0 },
              required: true,
              include: [
                {
                  model: ProductVariantAttributeValuesModel,
                  as: 'attributeValues',
                  include: [{ model: ProductAttributeModel, as: 'attribute' }],
                },
                { model: VariantImagesModel, as: 'images' },
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
                        'quantity', 'start_date', 'end_date', 'status', 'max_price'
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        });

        if (!fullProduct) return null;

        const productJson = fullProduct.toJSON();
        productJson.totalSold = prod.totalSold;

        const variants = productJson.variants || [];
        productJson.variantCount = variants.length;
        productJson.total_stock = variants.reduce((sum, v) => sum + (parseInt(v.stock) || 0), 0);

        // Rating cho các variant
        const vIds = variants.map(v => v.id);
        const ratingData = await Comment.findAll({
          where: { parent_id: null },
          include: [
            {
              model: OrderDetail,
              as: 'orderDetail',
              attributes: ['product_variant_id'],
              where: { product_variant_id: { [Op.in]: vIds } },
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
        });

        const ratingMap = {};
        for (const item of ratingData) {
          ratingMap[item.variantId] = {
            avgRating: parseFloat(item.avgRating || 0).toFixed(1),
            ratingCount: parseInt(item.ratingCount || 0, 10),
          };
        }

        // Gắn promo (có trần max_price) + rating
        for (const v of variants) {
          const price = parseFloat(v.price) || 0;

          const best = (v.promotionProducts || []).reduce((best, pp) => {
            const promo = pp.promotion;
            if (!promo) return best;

            // ✅ Bỏ qua nếu variant_quantity = 0
            if (pp.variant_quantity !== null && pp.variant_quantity <= 0) {
              return best;
            }

            const cap = promo.max_price != null
              ? Math.max(0, parseFloat(promo.max_price) || 0)
              : null;

            let discountAmount = 0;

            if (promo.discount_type === 'percentage') {
              const pct = Math.max(0, Math.min(100, parseFloat(promo.discount_value) || 0));
              const raw = price * (pct / 100);
              discountAmount = (cap != null) ? Math.min(raw, cap) : raw;
            } else if (promo.discount_type === 'fixed') {
              const fixed = Math.max(0, parseFloat(promo.discount_value) || 0);
              const raw = Math.min(fixed, price);
              discountAmount = (cap != null) ? Math.min(raw, cap) : raw;
            }

            const finalPrice = Math.max(0, price - discountAmount);
            const percent = price > 0 ? (discountAmount / price) * 100 : 0;

            const info = {
              id: promo.id,
              code: promo.code,
              discount_type: promo.discount_type,
              discount_value: parseFloat(promo.discount_value),
              discounted_price: parseFloat(finalPrice.toFixed(2)),
              discount_percent: parseFloat(percent.toFixed(2)),
              meets_conditions: promo.quantity == null || promo.quantity > 0,
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
            meets_conditions: true,
          };

          const rating = ratingMap[v.id] || { avgRating: '0.0', ratingCount: 0 };
          v.averageRating = rating.avgRating;
          v.ratingCount = rating.ratingCount;
        }

        return productJson;
      })
    );

    const filtered = enrichedTopProducts.filter(Boolean);
    return res.status(200).json(filtered);
  } catch (error) {
    console.error('Lỗi getTopSoldProducts:', error);
    return res.status(500).json({ message: 'Lỗi máy chủ', error: error.message });
  }
}





static async getDiscountedProducts(req, res) {
  try {
    const now = new Date();

    const discountedVariants = await ProductVariant.findAll({
      include: [
        {
          model: Product,
          as: 'product',
          where: { status: 1, publication_status: 'published' },
          attributes: ['id', 'name', 'thumbnail', 'createdAt'],
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
        { model: VariantImagesModel, as: 'images', attributes: ['id', 'image_url'] },

        // ✅ Chỉ lấy các promo còn lượt ở cấp biến thể (null hoặc > 0)
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
                'start_date', 'end_date', 'max_price', 'quantity'
              ],
            },
          ],
        },
      ],
      // Có required:true ở trên nên không cần điều kiện này nữa
      // where: { '$promotionProducts.promotion.id$': { [Op.ne]: null } },
    });

    // Rating cho các variant
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
        avgRating: parseFloat(item.avgRating || 0).toFixed(1),
        ratingCount: parseInt(item.ratingCount || 0, 10),
      };
    }

    // Gom theo product + chọn promo tốt nhất (áp dụng trần max_price)
    const productMap = new Map();

    for (const variant of discountedVariants) {
      const product = variant.product;
      if (!product) continue;

      const variantPrice = parseFloat(variant.price) || 0;

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
          const raw = Math.min(fixed, variantPrice); // không giảm quá giá gốc
          discountAmount = cap != null ? Math.min(raw, cap) : raw;
        }

        const finalPrice = Math.max(0, variantPrice - discountAmount);
        const percent = variantPrice > 0 ? (discountAmount / variantPrice) * 100 : 0;

        const info = {
          id: promo.id,
          code: promo.code,
          name: promo.name,
          discount_type: promo.discount_type,
          discount_value: parseFloat(promo.discount_value),
          discounted_price: parseFloat(finalPrice.toFixed(2)),
          discount_percent: parseFloat(percent.toFixed(2)),
          meets_conditions: promo.quantity == null || promo.quantity > 0,
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
        meets_conditions: true,
      };

      // Gắn rating
      const rating = ratingMap[variant.id] || { avgRating: '0.0', ratingCount: 0 };
      variantJson.averageRating = rating.avgRating;
      variantJson.ratingCount = rating.ratingCount;

      // Gom theo product
      if (!productMap.has(product.id)) {
        productMap.set(product.id, {
          id: product.id,
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

