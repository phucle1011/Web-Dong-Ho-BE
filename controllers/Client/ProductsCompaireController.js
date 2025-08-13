const { Op, Sequelize } = require("sequelize");
const ProductModel = require("../../models/productsModel");
const BrandModel = require("../../models/brandsModel");
const CategoryModel = require("../../models/categoriesModel");
const ProductVariantModel = require("../../models/productVariantsModel");
const VariantImageModel = require("../../models/variantImagesModel");
const AttributeValueModel = require("../../models/productVariantAttributeValuesModel");
const AttributeModel = require("../../models/productAttributesModel");

const getAllForComparison = async (req, res) => {
  try {
    const products = await ProductModel.findAll({
      where: {
        status: 1,
         publication_status:'published',
      },
      attributes: {
        include: [
          [
            Sequelize.literal(`(
              SELECT ROUND(AVG(c.rating), 1)
              FROM comments AS c
              JOIN order_details AS od ON od.id = c.order_detail_id
              JOIN product_variants AS pv ON pv.id = od.product_variant_id
              WHERE pv.product_id = products.id
            )`),
            "average_rating",
          ],
          [
            Sequelize.literal(`(
              SELECT COUNT(c.id)
              FROM comments AS c
              JOIN order_details AS od ON od.id = c.order_detail_id
              JOIN product_variants AS pv ON pv.id = od.product_variant_id
              WHERE pv.product_id = products.id
            )`),
            "review_count",
          ],
        ],
      },
      include: [
        {
          model: BrandModel,
          as: "brand",
          attributes: ["id", "name"],
        },
        {
          model: CategoryModel,
          as: "category",
          attributes: ["id", "name"],
        },
        {
          model: ProductVariantModel,
          as: "variants",
          attributes: ["id", "price", "stock", "sku", "product_id", "created_at", "updated_at"],
          include: [
            {
              model: VariantImageModel,
              as: "images",
              attributes: ["id", "image_url"],
            },
            {
              model: AttributeValueModel,
              as: "attributeValues",
              attributes: ["id", "value"],
              include: [
                {
                  model: AttributeModel,
                  as: "attribute",
                  attributes: ["id", "name"],
                },
              ],
            },
          ],
        },
      ],
      order: [["created_at", "DESC"]],
    });

    return res.status(200).json({
      success: true,
      message: "Lấy sản phẩm so sánh thành công",
      data: products,
    });
  } catch (error) {
    console.error("Error fetching products for comparison:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi khi lấy sản phẩm so sánh",
    });
  }
};

module.exports = {
  getAllForComparison,
};
