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
      const tokens = keyword.toLowerCase().split(/\s+/).filter(t => t);

      let finalIds = [];

      // Exact match theo tên: chỉ nhận product có >=1 variant bán thường
      if (keyword.trim()) {
        const whereEM = {
          status: 1,
          name: Sequelize.where(Sequelize.fn('LOWER', Sequelize.col('name')), keyword.toLowerCase()),
        };
        const em = await Product.findOne({
          where: whereEM,
          attributes: ['id'],
          include: [
            { model: Brand, as: 'brand', attributes: [], required: true, where: { status: 1 } },
            { model: Variant, as: 'variants', attributes: [], required: true, where: NON_AUCTION_WHERE }
          ],
          raw: true
        });
        if (em) finalIds = [em.id];
      }

      // Step 1: search by name/desc, SKU, attr-value, attr-name
      if (!finalIds.length) {
        // 1a. Name/Desc – product phải có >=1 variant bán thường
        const prodWhere = { status: 1 };
        if (tokens.length) {
          prodWhere[Op.or] = [
            ...tokens.map(t => ({ name: { [Op.like]: `%${t}%` } })),
            ...tokens.map(t => ({ description: { [Op.like]: `%${t}%` } })),
          ];
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

        // 1b. SKU – chỉ lấy variant bán thường
        let skuIds = [];
        if (tokens.length) {
          const skus = await Variant.findAll({
            where: {
              is_auction_only: 0,
              sku: { [Op.or]: tokens.map(t => ({ [Op.like]: `%${t}%` })) }
            },
            attributes: ['product_id'],
            raw: true
          });
          skuIds = skus.map(v => v.product_id);
        }

        // 1c. Attr value – chỉ variant bán thường
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

        // 1d. Attr name – chỉ variant bán thường
        let anIds = [];
        if (tokens.length) {
          const atts = await Attribute.findAll({
            where: { [Op.or]: tokens.map(t => ({ name: { [Op.like]: `%${t}%` } })) },
            attributes: ['id'], raw: true
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
          return res.json({ status: 200, message: 'Không tìm thấy', data: [], pagination: { page, limit, totalItems: 0, totalPages: 0 } });
        }

        // Step 2: lọc thêm theo attribute_filters – chỉ qua variant bán thường
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
            return res.json({ status: 200, message: 'Không tìm thấy thuộc tính phù hợp', data: [], pagination: { page, limit, totalItems: 0, totalPages: 0 } });
          }
        }
      }

      // Step 3: fetch data & paginate (variants chỉ là bán thường)
      const totalItems = finalIds.length;
      const totalPages = Math.ceil(totalItems / limit);
      const pageIds = finalIds.slice(offset, offset + limit);

      const products = await Product.findAll({
        where: { id: pageIds },
        include: [
          { model: Brand, as: 'brand', attributes: ['id', 'name'], where: { status: 1 }, required: true },
          { model: Category, as: 'category', attributes: ['id', 'name'] },
          {
            model: Variant,
            as: 'variants',
            where: NON_AUCTION_WHERE,     // <-- chỉ lấy biến thể bán thường
            required: false,
            include: [
              { model: Img, as: 'images', attributes: ['id', 'image_url'] },
              { model: AttrValue, as: 'attributeValues', include: [{ model: Attribute, as: 'attribute', attributes: ['id', 'name'] }] },
              {
                model: PromoProd, as: 'promotionProducts', required: false,
                include: [{
                  model: Promotion, as: 'promotion',
                  where: { start_date: { [Op.lte]: now }, end_date: { [Op.gte]: now }, status: 'active' },
                  required: false
                }]
              }
            ]
          }
        ],
        order: [['name', 'ASC']]
      });

      const data = products.map(p => ({
        id: p.id,
        name: p.name,
        description: p.description,
        thumbnail: toUrl(p.thumbnail, req),
        brand: p.brand?.name,
        category: p.category?.name,
        variants: (p.variants || []).map(v => {
          const promo = v.promotionProducts?.[0]?.promotion;
          let finalPrice = parseFloat(v.price);
          if (promo) {
            finalPrice = promo.discount_type === 'percentage'
              ? finalPrice * (1 - parseFloat(promo.discount_value) / 100)
              : finalPrice - parseFloat(promo.discount_value);
          }
          return {
            id: v.id,
            sku: v.sku,
            price: parseFloat(v.price),
            final_price: Math.max(finalPrice, 0),
            images: (v.images || []).map(i => ({ id: i.id, image_url: toUrl(i.image_url, req) })),
            attributes: (v.attributeValues || []).map(av => ({
              id: av.attribute.id,
              name: av.attribute.name,
              value: av.value
            })),
            promotion: promo ? {
              id: promo.id,
              code: promo.code,
              type: promo.discount_type,
              value: parseFloat(promo.discount_value)
            } : null
          };
        })
      }));

      return res.json({
        status: 200,
        message: 'Tìm kiếm thành công',
        data,
        pagination: { page, limit, totalItems, totalPages }
      });

    } catch (err) {
      console.error('Search error:', err);
      return res.status(500).json({ status: 500, message: 'Lỗi tìm kiếm', error: err.message });
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
          // chỉ lấy giá trị đang gắn với biến thể BÁN THƯỜNG
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
