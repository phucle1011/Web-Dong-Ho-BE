// D:\A_HocTap\DuAnTotNghiep\Web-Dong-Ho\BE\controllers\Client\brandController.js
const { Op } = require("sequelize");
const BrandModel = require("../../models/brandsModel");
const ProductModel = require("../../models/productsModel");
const ProductVariantModel = require("../../models/productVariantsModel");
const PromotionProductModel = require("../../models/promotionProductsModel");
const PromotionModel = require("../../models/promotionsModel");
const VariantImage = require("../../models/variantImagesModel");
const ProductVariantAttributeValue = require("../../models/productVariantAttributeValuesModel");
const ProductAttribute = require("../../models/productAttributesModel");
const { Sequelize } = require("sequelize");
class BrandController {
  static async getActiveBrands(req, res) {
    try {
      const { page = 1, limit = 100 } = req.query;
      const offset = (parseInt(page) - 1) * parseInt(limit);

      const brands = await BrandModel.findAll({
        where: { status: "active" },
        attributes: ["id", "name"],
        limit: parseInt(limit),
        offset,
      });

      return res.status(200).json({
        status: 200,
        message:
          brands.length === 0
            ? "Không tìm thấy thương hiệu."
            : "Lấy danh sách thương hiệu thành công",
        data: brands,
      });
    } catch (error) {
      console.error("Lỗi khi lấy danh sách thương hiệu:", error);
      return res.status(500).json({
        status: 500,
        error: error.message,
      });
    }
  }

  static async getProductsByBrands(req, res) {
    try {
      const { brandIds, page = 1, limit = 10, keyword } = req.query;
      const currentPage = parseInt(page);
      const currentLimit = parseInt(limit);
      const offset = (currentPage - 1) * currentLimit;
      const currentDate = new Date();

      let whereClause = { status: 1 };
      let brandIdArray = [];

      // Xử lý brandIds với cả kiểu string và array
      if (brandIds && brandIds !== "all") {
        if (typeof brandIds === "string") {
          brandIdArray = brandIds
            .split(",")
            .map((id) => parseInt(id))
            .filter((id) => !isNaN(id));
        } else if (Array.isArray(brandIds)) {
          brandIdArray = brandIds
            .map((id) => parseInt(id))
            .filter((id) => !isNaN(id));
        }

        if (brandIdArray.length === 0) {
          return res.status(400).json({
            status: 400,
            message: "Danh sách ID thương hiệu không hợp lệ.",
          });
        }

        whereClause.brand_id = { [Op.in]: brandIdArray };
      }

      if (keyword) {
        whereClause.name = { [Op.like]: `%${keyword}%` };
      }

      const { count, rows: products } = await ProductModel.findAndCountAll({
        where: whereClause,
        include: [
          {
            model: ProductVariantModel,
            as: "variants",
            include: [
              {
                model: VariantImage,
                as: "images",
                attributes: ["id", "image_url", "variant_id"],
              },
              {
                model: PromotionProductModel,
                as: "promotionProducts",
                include: [
                  {
                    model: PromotionModel,
                    as: "promotion",
                    where: {
                      status: "active",
                      start_date: { [Op.lte]: currentDate },
                      end_date: { [Op.gte]: currentDate },
                    },
                    required: false,
                  },
                ],
                required: false,
              },
              {
                model: ProductVariantAttributeValue,
                as: "attributeValues",
                include: [
                  {
                    model: ProductAttribute,
                    as: "attribute",
                    attributes: ["id", "name"],
                  },
                ],
              },
            ],
          },
        ],
        attributes: [
          "id",
          "name",
          "thumbnail",
          "description",
          "brand_id",
          "category_id",
          "status",
        ],
        order: [["name", "ASC"]],
        limit: currentLimit,
        offset,
      });

      const result = products.map((product) => {
        const variants = product.variants.map((variant) => {
          const promo = variant.promotionProducts?.[0]?.promotion || null;
          let finalPrice = parseFloat(variant.price) || 0;
          let discountPercent = 0;

          if (promo && promo.status === "active") {
            if (promo.discount_type === "percentage") {
              discountPercent = parseFloat(promo.discount_value);
              finalPrice = finalPrice * (1 - discountPercent / 100);
            } else if (promo.discount_type === "fixed") {
              discountPercent =
                ((parseFloat(variant.price) -
                  parseFloat(promo.discount_value)) /
                  parseFloat(variant.price)) *
                100;
              finalPrice =
                parseFloat(variant.price) - parseFloat(promo.discount_value);
            }
            finalPrice = Math.max(0, finalPrice);
          }

          return {
            ...variant.toJSON(),
            promotion: promo
              ? {
                  id: promo.id,
                  discount_type: promo.discount_type,
                  discount_value: parseFloat(promo.discount_value),
                  discounted_price: parseFloat(finalPrice.toFixed(2)),
                  discount_percent: parseFloat(discountPercent.toFixed(2)),
                }
              : null,
            attributeValues: variant.attributeValues.map((attr) => ({
              attribute: { id: attr.attribute.id, name: attr.attribute.name },
              value: attr.value,
            })),
          };
        });

        return {
          id: product.id,
          name: product.name,
          thumbnail: product.thumbnail,
          description: product.description,
          price: variants.length > 0 ? parseFloat(variants[0].price) : 0,
          stock: variants.reduce((sum, v) => sum + (parseInt(v.stock) || 0), 0),
          variants,
          review: 5, // Placeholder
        };
      });

      return res.status(200).json({
        status: 200,
        message:
          result.length === 0
            ? "Không tìm thấy sản phẩm."
            : "Lấy danh sách sản phẩm thành công",
        data: result,
        totalPages: Math.ceil(count / currentLimit),
        currentPage,
      });
    } catch (error) {
      return res.status(500).json({
        status: 500,
        error: error.message,
      });
    }
  }

  static async search(req, res) {
    try {
      const { name, page = 1, limit = 10 } = req.query;
      const offset = (parseInt(page) - 1) * parseInt(limit);

      let whereClause = { status: "active" };
      if (name) {
        whereClause.name = { [Op.like]: `%${name}%` };
      }

      const brands = await BrandModel.findAll({
        where: whereClause,
        attributes: ["id", "name"],
        limit: parseInt(limit),
        offset,
      });

      return res.status(200).json({
        status: 200,
        message:
          brands.length === 0
            ? "Không tìm thấy thương hiệu."
            : "Tìm kiếm thương hiệu thành công",
        data: brands,
      });
    } catch (error) {
      console.error("Lỗi khi tìm kiếm thương hiệu:", error);
      return res.status(500).json({
        status: 500,
        error: error.message,
      });
    }
  }
  static async getTopBrands(req, res) {
    try {
      const topBrands = await ProductModel.findAll({
        where: {
          status: 1,
          publication_status: "published",
        },
        attributes: [
          "brand_id",
          [Sequelize.fn("COUNT", Sequelize.col("products.id")), "productCount"], 
        ],
        include: [
          {
            model: BrandModel,
            as: "brand",
            attributes: [
              "id",
              "name",
              "slug",
              "country",
              "logo",
              "description",
            ],
            where: { status: "active" },
          },
        ],
        group: ["brand_id", "brand.id"],
        order: [[Sequelize.literal("productCount"), "DESC"]],
        limit: 10,
      });

      const formatted = topBrands.map((item) => ({
        id: item.brand.id,
        name: item.brand.name,
        slug: item.brand.slug,
        country: item.brand.country,
        logo: item.brand.logo,
        description: item.brand.description,
        productCount: item.dataValues.productCount,
      }));

      return res.status(200).json({
        status: 200,
        message:
          formatted.length === 0
            ? "Không tìm thấy thương hiệu."
            : "Lấy top thương hiệu thành công",
        data: formatted,
      });
    } catch (error) {
      console.error("Lỗi khi lấy top thương hiệu:", error);
      return res.status(500).json({
        status: 500,
        error: error.message,
      });
    }
  }
}

module.exports = BrandController;
