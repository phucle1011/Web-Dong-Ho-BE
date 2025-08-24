// Web-Dong-Ho-BE/controllers/Client/SearchController.js
const { Op } = require('sequelize');
const Sequelize = require('sequelize');
const Product = require('../../models/productsModel');
const Variant = require('../../models/productVariantsModel');
const Img = require('../../models/variantImagesModel');
const Brand = require('../../models/brandsModel');
const Category = require('../../models/categoriesModel');
const AttrValue = require('../../models/productVariantAttributeValuesModel');
const Attribute = require('../../models/productAttributesModel');
const PromoProd = require('../../models/promotionProductsModel');
const Promotion = require('../../models/promotionsModel');
const ProductModel = require('../../models/productsModel');
const OrderDetail = require('../../models/orderDetailsModel');
const Comment = require('../../models/commentsModel');

const NON_AUCTION_WHERE = { is_auction_only: 0 };

const toUrl = (u, req) => {
  if (!u) return u;
  if (/^https?:\/\//i.test(u)) return u;
  const base = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
  return `${base}/${String(u).replace(/^\/+/, '')}`;
};

class SearchController {
  static async searchProducts(req, res) {
    try {
      let {
        keyword = '',
        attribute_values = [],
        attribute_ids = [],
        page = 1,
        limit = 10,
      } = req.query;

      page = Math.max(1, +page);
      limit = Math.max(1, +limit);
      const offset = (page - 1) * limit;
      const now = new Date();

      const toIntList = v => v ? (`${v}`.split(',').map(x => +x).filter(n => n)) : [];
      const toStrList = v => v ? (`${v}`.split(',').map(x => x.trim().toLowerCase()).filter(x => x)) : [];

      const attrIds = toIntList(attribute_ids);
      const attrVals = toStrList(attribute_values);
      const keywordTrimmed = keyword.trim();
      const tokens = keywordTrimmed.toLowerCase().split(/\s+/).filter(t => t);
      let finalIds = [];

      // === 🔍 BỔ SUNG: Tìm theo tên đầy đủ (ưu tiên cao) ===
      if (keywordTrimmed) {
        try {
          const fullMatchProducts = await Product.findAll({
            where: {
              status: 1,
              name: { [Op.like]: `%${keywordTrimmed}%` }
            },
            attributes: ['id'],
            include: [{
              model: Variant,
              as: 'variants',
              attributes: [],
              required: true,
              where: {
                ...NON_AUCTION_WHERE,
                stock: { [Op.gt]: 0 } // Chỉ biến thể còn hàng
              }
            }],
            raw: true
          });

          if (fullMatchProducts.length > 0) {
            finalIds = Array.from(new Set(fullMatchProducts.map(p => p.id)));
          }
        } catch (err) {
          console.warn('Lỗi tìm kiếm tên đầy đủ:', err.message);
          // Vẫn tiếp tục với logic cũ nếu có lỗi
        }
      }

      // Step 1: Tìm theo tên, mô tả, SKU, thuộc tính
      if (!finalIds.length) {
        // 1a. Tìm theo tên và mô tả – ưu tiên chuỗi đầy đủ
        const prodWhere = { status: 1 };
        if (tokens.length) {
          const fullKeyword = keywordTrimmed.toLowerCase();
          prodWhere[Op.or] = [
            { name: { [Op.like]: `%${fullKeyword}%` } },
            { description: { [Op.like]: `%${fullKeyword}%` } },
            ...tokens.map(t => ({ name: { [Op.like]: `%${t}%` } })),
            ...tokens.map(t => ({ description: { [Op.like]: `%${t}%` } })),
          ];
        }

        // === 🔍 BỔ SUNG: Tìm exact match theo tên đầy đủ (như trang so sánh) ===
        if (keywordTrimmed) {
          const fullMatch = await Product.findOne({
            where: {
              status: 1,
              name: { [Op.like]: `%${keywordTrimmed}%` } // Tìm chuỗi con liền mạch
            },
            attributes: ['id'],
            include: [{
              model: Variant,
              as: 'variants',
              attributes: [],
              required: true,
              where: {
                ...NON_AUCTION_WHERE,
                stock: { [Op.gt]: 0 } // Chỉ sản phẩm có biến thể còn hàng
              }
            }],
            raw: true
          });

          if (fullMatch) {
            finalIds = [fullMatch.id]; // Ưu tiên tuyệt đối nếu tìm thấy
            // Không cần chạy các bước tìm kiếm khác
            return; // ❌ Không return, vì chúng ta muốn tiếp tục Step 2 & 3
          }
        }

        const prods = await Product.findAll({
          where: prodWhere,
          attributes: ['id'],
          include: [
            { model: Brand, as: 'brand', attributes: [], required: true, where: { status: 1 } },
            { model: Variant, as: 'variants', attributes: [], required: true, where: NON_AUCTION_WHERE }
          ],
          raw: true
        });
        const nameDescIds = prods.map(p => p.id);

        // 1b. Tìm theo SKU
        let skuIds = [];
        if (tokens.length) {
          const skus = await Variant.findAll({
            where: {
              ...NON_AUCTION_WHERE,
              sku: { [Op.or]: tokens.map(t => ({ [Op.like]: `%${t}%` })) }
            },
            attributes: ['product_id'],
            raw: true
          });
          skuIds = skus.map(v => v.product_id);
        }

        // 1c. Tìm theo giá trị thuộc tính
        let avIds = [];
        if (tokens.length) {
          const avs = await AttrValue.findAll({
            where: { [Op.or]: tokens.map(t => ({ value: { [Op.like]: `%${t}%` } })) },
            include: [{
              model: Variant,
              as: 'variant',
              attributes: ['product_id'],
              required: true,
              where: NON_AUCTION_WHERE
            }],
            attributes: ['variant.product_id'],
            raw: true
          });
          avIds = avs.map(a => a['variant.product_id']);
        }

        // 1d. Tìm theo tên thuộc tính
        let anIds = [];
        if (tokens.length) {
          const atts = await Attribute.findAll({
            where: { [Op.or]: tokens.map(t => ({ name: { [Op.like]: `%${t}%` } })) },
            attributes: ['id'],
            raw: true
          });
          const ids = atts.map(a => a.id);
          if (ids.length) {
            const names = await AttrValue.findAll({
              where: { product_attribute_id: { [Op.in]: ids } },
              include: [{
                model: Variant,
                as: 'variant',
                attributes: ['product_id'],
                required: true,
                where: NON_AUCTION_WHERE
              }],
              attributes: ['variant.product_id'],
              raw: true
            });
            anIds = names.map(n => n['variant.product_id']);
          }
        }

        finalIds = Array.from(new Set([...nameDescIds, ...skuIds, ...avIds, ...anIds]));
        if (!finalIds.length) {
          return res.json({
            status: 200,
            message: 'Không tìm thấy sản phẩm nào',
            data: [],
            pagination: { page, limit, totalItems: 0, totalPages: 0 }
          });
        }

        // Step 2: Lọc theo bộ lọc thuộc tính (nếu có)
        if (attrIds.length || attrVals.length) {
          const avWhere = {};
          if (attrIds.length) avWhere.product_attribute_id = { [Op.in]: attrIds };
          if (attrVals.length) avWhere[Op.or] = attrVals.map(v => ({ value: { [Op.like]: `%${v}%` } }));

          const matches = await AttrValue.findAll({
            where: { ...avWhere, '$variant.product_id$': { [Op.in]: finalIds } },
            include: [{
              model: Variant,
              as: 'variant',
              attributes: ['product_id'],
              required: true,
              where: NON_AUCTION_WHERE
            }],
            attributes: [],
            raw: true
          });

          finalIds = Array.from(new Set(matches.map(m => m['variant.product_id'])));
          if (!finalIds.length) {
            return res.json({
              status: 200,
              message: 'Không tìm thấy sản phẩm phù hợp với bộ lọc',
              data: [],
              pagination: { page, limit, totalItems: 0, totalPages: 0 }
            });
          }
        }
      }

      // Step 3: Lấy dữ liệu sản phẩm + biến thể còn hàng
      const totalItems = finalIds.length;
      const totalPages = Math.ceil(totalItems / limit);
      const pageIds = finalIds.slice(offset, offset + limit);

      const products = await Product.findAll({
        where: { id: pageIds },
        attributes: ['id', 'name', 'description', 'thumbnail', 'slug'],
        include: [
          { model: Brand, as: 'brand', attributes: ['id', 'name'], where: { status: 1 }, required: true },
          { model: Category, as: 'category', attributes: ['id', 'name'] },
          {
            model: Variant,
            as: 'variants',
            where: {
              ...NON_AUCTION_WHERE,
              stock: { [Op.gt]: 0 } // Chỉ lấy biến thể còn hàng
            },
            required: false,
            include: [
              { model: Img, as: 'images', attributes: ['id', 'image_url'] },
              { model: AttrValue, as: 'attributeValues', include: [{ model: Attribute, as: 'attribute', attributes: ['id', 'name'] }] },
              {
                model: PromoProd,
                as: 'promotionProducts',
                required: false,
                include: [{
                  model: Promotion,
                  as: 'promotion',
                  where: {
                    start_date: { [Op.lte]: now },
                    end_date: { [Op.gte]: now },
                    status: 'active'
                  },
                  required: false
                }]
              }
            ]
          }
        ],
        order: [['name', 'ASC']]
      });

      // Sắp xếp lại theo độ phù hợp với từ khóa
      const sortedProducts = products.sort((a, b) => {
        const kw = keywordTrimmed.toLowerCase();
        if (!kw) return 0;

        const matchA = (
          (a.name.toLowerCase() === kw ? 100 : 0) +
          (a.name.toLowerCase().includes(kw) ? 50 : 0) +
          (a.name.toLowerCase().split(kw).length - 1) * 10
        );
        const matchB = (
          (b.name.toLowerCase() === kw ? 100 : 0) +
          (b.name.toLowerCase().includes(kw) ? 50 : 0) +
          (b.name.toLowerCase().split(kw).length - 1) * 10
        );
        return matchB - matchA;
      });

      // === ⭐ TÍNH SAO/ĐÁNH GIÁ CHO VARIANT & SẢN PHẨM ===
      const allVariantIds = sortedProducts.flatMap(p => (p.variants || []).map(v => v.id));
      let ratingMap = {};
      if (allVariantIds.length > 0) {
        const ratingRows = await Comment.findAll({
          where: { parent_id: null },
          include: [{
            model: OrderDetail,
            as: 'orderDetail',
            attributes: ['product_variant_id'],
            where: { product_variant_id: { [Op.in]: allVariantIds } },
            required: true,
          }],
          attributes: [
            [Sequelize.col('orderDetail.product_variant_id'), 'variantId'],
            [Sequelize.fn('AVG', Sequelize.col('rating')), 'avgRating'],
            [Sequelize.fn('COUNT', Sequelize.col('rating')), 'ratingCount'],
          ],
          group: ['orderDetail.product_variant_id'],
          raw: true,
        });

        ratingMap = ratingRows.reduce((acc, r) => {
          acc[r.variantId] = {
            avgRating: Number(parseFloat(r.avgRating || 0).toFixed(1)),
            ratingCount: parseInt(r.ratingCount || 0, 10),
          };
          return acc;
        }, {});
      }


      const data = sortedProducts.map(p => {
        // Sắp xếp variants: còn hàng lên trước
        const sortedVariants = [...(p.variants || [])].sort((a, b) => {
          if (a.stock > 0 && b.stock === 0) return -1;
          if (a.stock === 0 && b.stock > 0) return 1;
          return (b.stock || 0) - (a.stock || 0);
        });

        // Tính rating cấp sản phẩm từ rating của các variant (có trọng số)
        let sumWeighted = 0;
        let sumCount = 0;

        const variantsPayload = sortedVariants.map(v => {
          const promo = v.promotionProducts?.[0]?.promotion;
          let finalPrice = parseFloat(v.price);
          if (promo) {
            finalPrice = promo.discount_type === 'percentage'
              ? finalPrice * (1 - parseFloat(promo.discount_value) / 100)
              : finalPrice - parseFloat(promo.discount_value);
          }

          const r = ratingMap[v.id] || { avgRating: 0, ratingCount: 0 };
          sumWeighted += r.avgRating * r.ratingCount;
          sumCount += r.ratingCount;

          return {
            id: v.id,
            sku: v.sku,
            price: parseFloat(v.price),
            final_price: Math.max(finalPrice, 0),
            stock: v.stock,
            images: (v.images || []).map(i => ({ id: i.id, image_url: toUrl(i.image_url, req) })),
            attributes: (v.attributeValues || []).map(av => ({
              id: av.attribute.id,
              name: av.attribute.name,
              value: av.value
            })),
            // ⭐ Gắn rating cho biến thể
            averageRating: r.avgRating,
            ratingCount: r.ratingCount,
            promotion: promo ? {
              id: promo.id,
              code: promo.code,
              type: promo.discount_type,
              value: parseFloat(promo.discount_value)
            } : null
          };
        });

        // ⭐ Rating cấp sản phẩm (nếu có dữ liệu)
        const productAvg = sumCount > 0 ? Number((sumWeighted / sumCount).toFixed(1)) : 0;
        const productCnt = sumCount;

        return {
          id: p.id,
          name: p.name,
          slug: p.slug,
          description: p.description,
          thumbnail: toUrl(p.thumbnail, req),
          brand: p.brand?.name,
          category: p.category?.name,
          // ⭐ Gắn rating cấp sản phẩm
          averageRating: productAvg,
          ratingCount: productCnt,
          variants: variantsPayload,
        };
      });


      return res.json({
        status: 200,
        message: 'Tìm kiếm thành công',
        data,
        pagination: { page, limit, totalItems, totalPages }
      });

    } catch (err) {
      console.error('Search error:', err);
      return res.status(500).json({
        status: 500,
        message: 'Lỗi tìm kiếm',
        error: err.message
      });
    }
  }

  static async getAttributeValues(req, res) {
    try {
      let { attribute_id, page = 1, limit = 100 } = req.query;
      page = Math.max(1, parseInt(page, 10));
      limit = Math.max(1, parseInt(limit, 10));
      const offset = (page - 1) * limit;
      attribute_id = parseInt(attribute_id, 10);

      const where = {};
      if (attribute_id) {
        where.product_attribute_id = attribute_id;
      }

      const attributeValues = await AttrValue.findAll({
        where,
        attributes: [
          [Sequelize.fn('DISTINCT', Sequelize.col('value')), 'value'],
          'product_attribute_id'
        ],
        include: [
          {
            model: Variant,
            as: 'variant',
            attributes: [],
            required: true,
            where: NON_AUCTION_WHERE,
            include: [
              {
                model: ProductModel,
                as: 'product',
                attributes: [],
                required: true,
                where: { publication_status: 'published', status: 1 }
              }
            ]
          },
          {
            model: Attribute,
            as: 'attribute',
            attributes: ['name']
          }
        ],
        raw: true,
        offset,
        limit
      });

      const totalItems = attributeValues.length;

      return res.json({
        status: 200,
        message: 'Lấy danh sách giá trị thuộc tính thành công',
        data: attributeValues.map(av => ({
          id: av.value,
          value: av.value,
          attribute_id: av.product_attribute_id,
          attribute_name: av['attribute.name']
        })),
        pagination: {
          page,
          limit,
          totalItems,
          totalPages: Math.ceil(totalItems / limit)
        }
      });
    } catch (err) {
      console.error('Get attribute values error:', err);
      return res.status(500).json({
        status: 500,
        message: 'Lỗi khi lấy giá trị thuộc tính',
        error: err.message
      });
    }
  }

  static async getProductAttributes(req, res) {
    try {
      const attrs = await Attribute.findAll({
        attributes: ['id', 'name'],
        order: [['id', 'ASC']],
        raw: true
      });
      return res.json({ status: 200, data: attrs });
    } catch (err) {
      console.error('Get product attributes error:', err);
      return res.status(500).json({
        status: 500,
        message: 'Lỗi lấy danh sách thuộc tính',
        error: err.message
      });
    }
  }
}

module.exports = SearchController;