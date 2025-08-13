const { Op } = require('sequelize');
const ProductModel = require('../../models/productsModel');
const ProductVariantModel = require('../../models/productVariantsModel');
const ProductVariantAttributeValue = require('../../models/productVariantAttributeValuesModel');
const ProductAttribute = require('../../models/productAttributesModel');
const VariantImage = require('../../models/variantImagesModel');
const PromotionProductModel = require('../../models/promotionProductsModel');
const PromotionModel = require('../../models/promotionsModel');

class ProductVariantController {
  // =========================
  // 1. Chi tiết biến thể có giảm giá
  // =========================
  static async getProductVariantDetail(req, res) {
    try {
      const { id } = req.params;

      const productVariant = await ProductVariantModel.findByPk(id);

      if (!productVariant) {
        return res.status(404).json({ message: 'Không tìm thấy biến thể sản phẩm' });
      }

      const allPromotions = await PromotionProductModel.findAll({
        where: { product_variant_id: id },
        include: [{ model: PromotionModel, as: 'promotion' }],
      });

      const currentDate = new Date();

      const activePromotions = allPromotions.filter(pp => {
        const promo = pp.promotion;
        return (
          promo &&
          promo.status === 'active' &&
          new Date(promo.start_date) <= currentDate &&
          new Date(promo.end_date) >= currentDate
        );
      });

      const activePromotionProduct = activePromotions[0];

      let finalPrice = parseFloat(productVariant.price);
      let promotionData = null;

      if (activePromotionProduct?.promotion) {
        const promo = activePromotionProduct.promotion;

        if (promo.discount_type === 'percentage') {
          finalPrice -= (finalPrice * promo.discount_value) / 100;
        } else {
          finalPrice -= promo.discount_value;
        }

        if (finalPrice < 0) finalPrice = 0;

        promotionData = {
          id: promo.id,
          code: promo.code,
          discount_type: promo.discount_type,
          discount_value: parseFloat(promo.discount_value),
          discounted_price: parseFloat(finalPrice.toFixed(2)),
        };
      }

      return res.json({
        id: productVariant.id,
        name: productVariant.name,
        price: parseFloat(productVariant.price),
        promotion: promotionData,
      });

    } catch (error) {
      console.error('Error in getProductVariantDetail:', error);
      return res.status(500).json({ message: 'Lỗi máy chủ' });
    }
  }

  // =========================
  // 2. Danh sách sản phẩm đang có khuyến mãi
  // =========================
 static async getDiscountedProducts(req, res) {
  const { page = 1, limit = 10, search = '' } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const currentDate = new Date();

  try {
    const whereCondition = {};
    if (search) {
      whereCondition.name = { [Op.like]: `%${search}%` };
    }

    const { count, rows: products } = await ProductModel.findAndCountAll({
      where: whereCondition,
      include: [
        {
          model: ProductVariantModel,
          as: 'variants',
          include: [
            {
              model: PromotionProductModel,
              as: 'promotionProducts',
              include: [
                {
                  model: PromotionModel,
                  as: 'promotion',
                  where: {
                    status: 'active',
                    start_date: { [Op.lte]: currentDate },
                    end_date: { [Op.gte]: currentDate },
                  },
                  required: true,
                },
              ],
            },
            {
              model: ProductVariantAttributeValue,
              as: 'attributeValues',
              include: [{ model: ProductAttribute, as: 'attribute' }],
            },
            { model: VariantImage, as: 'images' },
          ],
        },
      ],
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
      offset,
      distinct: true,
    });

    const result = products.map((product) => {
      const productJson = product.toJSON();

      productJson.variants = productJson.variants
        .map((variant) => {
          const promoProduct = variant.promotionProducts?.[0];
          const promo = promoProduct?.promotion;

          if (promo) {
            const originalPrice = parseFloat(variant.price) || 0;
            let discountedPrice = originalPrice;
            let discountPercent = 0;

            if (promo.discount_type === 'fixed') {
              discountedPrice = originalPrice - parseFloat(promo.discount_value);
            } else if (promo.discount_type === 'percentage') {
              discountPercent = parseFloat(promo.discount_value);
              discountedPrice = originalPrice * (1 - discountPercent / 100);
            }

            // Ensure discounted_price is not negative or zero
            discountedPrice = Math.max(0, discountedPrice);

            // Calculate discount_percent accurately
            if (originalPrice > 0) {
              discountPercent = ((originalPrice - discountedPrice) / originalPrice) * 100;
            }

            return {
              ...variant,
              promotion: {
                id: promo.id,
                name: promo.name,
                discount_type: promo.discount_type,
                discount_value: parseFloat(promo.discount_value),
                discounted_price: parseFloat(discountedPrice.toFixed(2)),
                discount_percent: parseFloat(discountPercent.toFixed(2)),
              },
            };
          }

          return null;
        })
        .filter((v) => v !== null && v.promotion.discounted_price > 0); // Only keep valid variants

      return productJson.variants.length > 0 ? productJson : null;
    }).filter((product) => product !== null);

    res.status(200).json({
      status: 200,
      message: 'Danh sách sản phẩm giảm giá',
      data: result,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(count / limit),
        totalItems: count,
      },
    });
  } catch (error) {
    console.error('getDiscountedProducts error:', error);
    res.status(500).json({ error: error.message });
  }
}
}

module.exports = ProductVariantController;
//