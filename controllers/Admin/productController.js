const Product = require("../../models/productsModel");
const ProductVariant = require("../../models/productVariantsModel");
const ProductVariantAttributeValue = require("../../models/productVariantAttributeValuesModel");
const ProductAttribute = require("../../models/productAttributesModel");
const VariantImage = require("../../models/variantImagesModel");
const BrandModel = require("../../models/brandsModel");
const CategoryModel = require("../../models/categoriesModel");
const cloudinary = require("../../config/cloudinaryConfig");
const OrderDetail = require("../../models/orderDetailsModel");
const CartItem = require("../../models/cartDetailsModel");
const PromotionProduct = require("../../models/promotionProductsModel");
const Promotion = require("../../models/promotionsModel");
const AuctionsModel = require("../../models/auctionsModel");
const CartDetailModel = require("../../models/cartDetailsModel");
const OrderDetailModel = require("../../models/orderDetailsModel");

const { Op,Sequelize } = require("sequelize");

class ProductController {
  // Lấy tất cả thuộc tính sản phẩm
static async getAllAttributes(req, res) {
  try {
    const attributes = await ProductAttribute.findAll({
      order: [["id", "ASC"]],
    });

    res.status(200).json({
      status: 200,
      message: "Lấy danh sách thuộc tính thành công",
      data: attributes,
    });
  } catch (error) {
    console.error("Lỗi khi lấy thuộc tính:", error);
    res.status(500).json({ error: error.message });
  }
}

  // Lấy tất cả sản phẩm có biến thể

static async getDraftProducts(req, res) {
  try {
    const page  = Math.max(parseInt(req.query.page)  || 1, 1);
    const limit = Math.max(parseInt(req.query.limit) || 10, 1);
    const offset = (page - 1) * limit;

    const rawSearch = (req.query.searchTerm || "").trim();
    const categoryId = req.query.categoryId ? parseInt(req.query.categoryId) : null;
    const brandId    = req.query.brandId    ? parseInt(req.query.brandId)    : null;

    // where cho bảng Product (AND nhiều từ khóa)
    const whereClause = {
      publication_status: "draft",
      ...(categoryId ? { category_id: categoryId } : {}),
      ...(brandId    ? { brand_id: brandId }       : {}),
      ...(rawSearch
        ? {
            [Op.and]: rawSearch.split(/\s+/).map(kw => ({
              name: { [Op.like]: `%${kw}%` }
            })),
          }
        : {}
      ),
    };

    const totalProducts = await Product.count({ where: whereClause });

    const products = await Product.findAll({
      where: whereClause,
      order: [["created_at", "DESC"]],
      limit,
      offset,
      include: [
        {
          model: ProductVariant,
          as: "variants",
          attributes: ["id","sku","price","stock","product_id"],
          include: [
            {
              model: ProductVariantAttributeValue,
              as: "attributeValues",
              include: [{ model: ProductAttribute, as: "attribute" }],
              required: false,
            },
            {
              model: VariantImage,
              as: "images",
              attributes: ["id","image_url"],
              required: false,
            },
            // kiểm tra biến thể đang được dùng
            { model: CartDetailModel,  as: "carts",        attributes: ["id"], required: false },
            { model: OrderDetailModel, as: "orderDetails", attributes: ["id"], required: false },
            { model: AuctionsModel,    as: "auctions",     attributes: ["id"], required: false },
          ],
        },
        { model: CategoryModel, as: "category", attributes: ["id","name"] },
        { model: BrandModel,    as: "brand",    attributes: ["id","name"] },
      ],
    });

    const productsWithFlags = products.map((product) => {
      const p = product.toJSON();
      p.variantCount = p.variants?.length || 0;

      const anyVariantInUse = (p.variants || []).some(v =>
        (v.carts?.length > 0) || (v.orderDetails?.length > 0) || (v.auctions?.length > 0)
      );

      // chỉ cho xoá khi không có biến thể, hoặc có nhưng KHÔNG biến thể nào đang dùng
      p.canDelete = (p.variantCount === 0) || !anyVariantInUse;

      // có thể nhẹ payload:
      // p.variants?.forEach(v => { delete v.carts; delete v.orderDetails; delete v.auctions; });

      return p;
    });

    const totalVariants = products.reduce(
      (sum, product) => sum + (product.variants?.length || 0),
      0
    );

    res.status(200).json({
      status: 200,
      message: "Lấy danh sách sản phẩm (DRAFT) thành công",
      data: productsWithFlags,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalProducts / limit),
        totalProducts,
      },
      totalVariants,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}




static async getPublishedProducts(req, res) {
  try {
    const page  = parseInt(req.query.page)  || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    const { searchTerm = "", categoryId, brandId } = req.query;

    // where cho bảng Product
    const whereClause = {
      publication_status: "published",
      ...(searchTerm ? { name: { [Op.like]: `%${searchTerm}%` } } : {}),
      ...(categoryId ? { category_id: categoryId } : {}),
      ...(brandId ? { brand_id: brandId } : {}),
    };

    const totalProducts = await Product.count({ where: whereClause });

    const products = await Product.findAll({
      where: whereClause,
      order: [["created_at", "DESC"]],
      limit,
      offset,
      include: [
        {
          model: ProductVariant,
          as: "variants",
          attributes: ["id","sku","price","stock","product_id"],
          include: [
            {
              model: ProductVariantAttributeValue,
              as: "attributeValues",
              include: [{ model: ProductAttribute, as: "attribute" }],
              required: false,
            },
            {
              model: VariantImage,
              as: "images",
              attributes: ["id","image_url"],
              required: false,
            },
            // Kiểm tra biến thể đang được dùng
            { model: CartDetailModel,  as: "carts",        attributes: ["id"], required: false },
            { model: OrderDetailModel, as: "orderDetails", attributes: ["id"], required: false },
            { model: AuctionsModel,    as: "auctions",     attributes: ["id"], required: false },
          ],
        },
        { model: CategoryModel, as: "category", attributes: ["id", "name"] },
        { model: BrandModel,    as: "brand",    attributes: ["id", "name"]  },
      ],
    });

    const productsWithFlags = products.map((product) => {
      const p = product.toJSON();
      p.variantCount = p.variants?.length || 0;

      const anyVariantInUse = (p.variants || []).some(v =>
        (v.carts?.length > 0) ||
        (v.orderDetails?.length > 0) ||
        (v.auctions?.length > 0)
      );

      // Chỉ cho xoá khi không có biến thể, hoặc có nhưng KHÔNG biến thể nào đang được dùng
      p.canDelete = (p.variantCount === 0) || !anyVariantInUse;

      // (tuỳ chọn) nhẹ payload:
      // p.variants?.forEach(v => { delete v.carts; delete v.orderDetails; delete v.auctions; });

      return p;
    });

    const totalVariants = products.reduce((sum, p) => sum + (p.variants?.length || 0), 0);

    res.status(200).json({
      status: 200,
      message: "Lấy danh sách sản phẩm (PUBLISHED) thành công",
      data: productsWithFlags,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalProducts / limit),
        totalProducts,
      },
      totalVariants,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}




static async getPublishedAuctionProducts(req, res) {
  try {
    const page  = Math.max(parseInt(req.query.page)  || 1, 1);
    const limit = Math.max(parseInt(req.query.limit) || 10, 1);
    const offset = (page - 1) * limit;

    const rawSearch = (req.query.searchTerm || "").trim();
    const categoryId = req.query.categoryId ? parseInt(req.query.categoryId) : null;
    const brandId    = req.query.brandId    ? parseInt(req.query.brandId)    : null;

    // where cho Product (tìm nhiều từ khóa theo AND)
    const productWhere = {
      publication_status: "published",
      ...(categoryId ? { category_id: categoryId } : {}),
      ...(brandId    ? { brand_id: brandId }       : {}),
      ...(rawSearch
        ? {
            [Op.and]: rawSearch.split(/\s+/).map(kw => ({
              name: { [Op.like]: `%${kw}%` }
            })),
          }
        : {}
      ),
    };

    // --- Query 1: đếm + lấy IDs (bắt buộc có variant is_auction_only=1) ---
    const { count: totalProducts, rows: products } = await Product.findAndCountAll({
      where: productWhere,
      include: [
        {
          model: ProductVariant,
          as: "variants",
          where: { is_auction_only: 1 },
          required: true,
          attributes: [], // không lấy dữ liệu variant khi đếm
        },
      ],
      order: [["created_at", "DESC"]],
      limit,
      offset,
      distinct: true, // count theo Product, không bị nhân bản
    });

    if (!products.length) {
      return res.status(200).json({
        status: 200,
        message: "Không có sản phẩm đấu giá phù hợp",
        data: [],
        pagination: { currentPage: page, totalPages: 0, totalProducts: 0 },
        totalVariants: 0,
      });
    }

    const productIds = products.map((p) => p.id);

    // --- Query 2: lấy đầy đủ thông tin cho các id vừa tìm được ---
    const productsFull = await Product.findAll({
      where: { id: productIds },
      order: [["created_at", "DESC"]],
      include: [
        {
          model: ProductVariant,
          as: "variants",
          where: { is_auction_only: 1 },
          required: true,
          attributes: ["id","sku","price","stock","product_id"],
          include: [
            {
              model: ProductVariantAttributeValue,
              as: "attributeValues",
              include: [{ model: ProductAttribute, as: "attribute" }],
              required: false,
            },
            { model: VariantImage, as: "images", attributes: ["id","image_url"], required: false },

            // (tuỳ chọn) để tính canDelete như các API khác
            { model: CartDetailModel,  as: "carts",        attributes: ["id"], required: false },
            { model: OrderDetailModel, as: "orderDetails", attributes: ["id"], required: false },
            { model: AuctionsModel,    as: "auctions",     attributes: ["id"], required: false },
          ],
        },
        { model: CategoryModel, as: "category", attributes: ["id","name"] },
        { model: BrandModel,    as: "brand",    attributes: ["id","name"]  },
      ],
    });

    const data = productsFull.map((p) => {
      const j = p.toJSON();
      j.variantCount = j.variants?.length || 0;

      // (tuỳ chọn) canDelete: ẩn nút xoá nếu có biến thể đấu giá đã dùng
      const anyVariantInUse = (j.variants || []).some(v =>
        (v.carts?.length > 0) || (v.orderDetails?.length > 0) || (v.auctions?.length > 0)
      );
      j.canDelete = (j.variantCount === 0) || !anyVariantInUse;

      return j;
    });

    const totalVariants = productsFull.reduce(
      (sum, p) => sum + (p.variants?.length || 0),
      0
    );

    return res.status(200).json({
      status: 200,
      message: "Lấy danh sách sản phẩm đấu giá đã xuất bản thành công",
      data,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalProducts / limit),
        totalProducts,
      },
      totalVariants,
    });
  } catch (error) {
    console.error("Lỗi getPublishedAuctionProducts:", error);
    return res.status(500).json({ error: error.message });
  }
}






  // Lấy chi tiết theo ID
 static async getById(req, res) {
  try {
    const { id } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    // Lấy thông tin sản phẩm
    const product = await Product.findByPk(id, {
      attributes: [
        "id", "name", "slug", "description", "short_description", "brand_id", "category_id", 
        "thumbnail", "status", "publication_status", "createdAt", "updatedAt"
      ],
      include: [
        {
          model: CategoryModel,
          as: "category",
          attributes: ["id", "name"],
        },
        {
          model: BrandModel,
          as: "brand",
          attributes: ["id", "name"],
        },
      ],
    });

    if (!product) {
      return res.status(404).json({ message: "Sản phẩm không tồn tại" });
    }

    // Lấy danh sách biến thể có phân trang
    const { count, rows } = await ProductVariant.findAndCountAll({
      where: { product_id: id },
      limit,
      offset,
      distinct: true,
      include: [
        {
          model: ProductVariantAttributeValue,
          as: "attributeValues",
          include: [
            {
              model: ProductAttribute,
              as: "attribute",
            },
          ],
        },
        {
          model: VariantImage,
          as: "images",
        },
        {
          model: OrderDetail,
          as: "orderDetails",
          attributes: ["id"],
          required: false,
        },
        {
          model: CartItem,
          as: "carts",
          attributes: ["id"],
          required: false,
        },
        {
          model: AuctionsModel,
          as: "auctions", // phải đúng alias bạn định nghĩa ở association
          attributes: ["id"],
          required: false,
        },
      ],
      order: [["created_at", "DESC"]],
    });

    // Gắn thêm flag canDelete
    const variants = rows.map((variant) => {
      const usedInOrder = variant.orderDetails && variant.orderDetails.length > 0;
      const usedInCart = variant.carts && variant.carts.length > 0;
const usedInAuction = variant.auctions && variant.auctions.length > 0; // ✅ đúng alias

      return {
        ...variant.toJSON(),
        canDelete: !usedInOrder && !usedInCart && !usedInAuction,
        usedIn: {
          order: usedInOrder,
          cart: usedInCart,
          auction: usedInAuction,
        },
      };
    });

    // Trả về kết quả
    res.status(200).json({
      status: 200,
      data: {
        ...product.toJSON(),
        variants,
        pagination: {
          total: count,
          page,
          limit,
          totalPages: Math.ceil(count / limit),
        },
      },
    });
  } catch (error) {
    console.error("Lỗi khi lấy chi tiết sản phẩm:", error);
    res.status(500).json({ error: error.message });
  }
}







  // Tạo mới sản phẩm + biến thể
static async createProduct(req, res) {
  try {
    const {
      name,
      slug,
      description,
      short_description, // <== Thêm dòng này
      brand_id,
      category_id,
      thumbnail,
      status,
      is_featured,
    } = req.body;

    const product = await Product.create({
      name,
      slug,
      description,
      short_description, // <== Thêm dòng này
      brand_id,
      category_id,
      thumbnail: thumbnail?.url || null,
      status,
      publication_status: is_featured,
    });

    res.status(201).json({ message: "Tạo sản phẩm thành công", product });

  } catch (error) {
    console.error(error);

    if (error instanceof Sequelize.UniqueConstraintError) {
      return res.status(400).json({
        error: "Tên hoặc slug sản phẩm đã tồn tại.",
        fields: error.errors.map(e => e.path)
      });
    }

    res.status(500).json({ error: error.message });
  }
}



 static async addVariant(req, res) {
  const t = await ProductVariant.sequelize.transaction();
  try {
    const { product_id } = req.params;
    const { sku, price, stock, attributes, images, is_auction_only } = req.body;

    // Kiểm tra sản phẩm tồn tại
    const product = await Product.findByPk(product_id);
    if (!product) {
      await t.rollback();
      return res.status(404).json({ message: "Sản phẩm không tồn tại" });
    }

    // 👉 Nếu là sản phẩm đấu giá thì ép stock = 1
    const finalStock = is_auction_only === 1 || is_auction_only === "1" ? 1 : stock;

    // Tạo biến thể sản phẩm
    const variant = await ProductVariant.create(
      {
        product_id,
        sku,
        price,
        stock: finalStock,
        is_auction_only: is_auction_only || 0
      },
      { transaction: t }
    );

    // Tạo các thuộc tính biến thể (nếu có)
    if (Array.isArray(attributes)) {
      for (const attr of attributes) {
        await ProductVariantAttributeValue.create(
          {
            product_variant_id: variant.id,
            product_attribute_id: attr.attribute_id,
            value: attr.value,
          },
          { transaction: t }
        );
      }
    }

    // Tạo ảnh biến thể (nếu có)
    if (Array.isArray(images)) {
      for (const imageUrl of images) {
        await VariantImage.create(
          {
            variant_id: variant.id,
            image_url: imageUrl,
          },
          { transaction: t }
        );
      }
    }

    await t.commit();
    res.status(201).json({ message: "Tạo biến thể thành công", variant });
  } catch (error) {
    await t.rollback();
    if (error instanceof Sequelize.UniqueConstraintError) {
      return res.status(400).json({
        message: "SKU đã tồn tại.",
        fields: error.errors.map(e => e.path)
      });
    }

    res.status(500).json({ error: error.message });
  }
}


  // Cập nhật biến thể sản phẩm
  static async updateVariant(req, res) {
  const t = await ProductVariant.sequelize.transaction();
  try {
    const { variant_id } = req.params;
    const { sku, price, stock, attributes, images, is_auction_only } = req.body;

    const variant = await ProductVariant.findByPk(variant_id);
    if (!variant) {
      await t.rollback();
      return res.status(404).json({ message: "Biến thể không tồn tại" });
    }

    // ✅ Nếu có is_auction_only = 1 thì ép stock = 1
    const updatedStock = is_auction_only === 1 || is_auction_only === "1" ? 1 : stock;

    // Cập nhật thông tin cơ bản
    if (sku !== undefined) variant.sku = sku;
    if (price !== undefined) variant.price = price;
    if (updatedStock !== undefined) variant.stock = updatedStock;
    if (is_auction_only !== undefined) variant.is_auction_only = is_auction_only;
    await variant.save({ transaction: t });

    // Xóa các thuộc tính cũ và tạo mới
    await ProductVariantAttributeValue.destroy({
      where: { product_variant_id: variant_id },
      transaction: t,
    });

    if (Array.isArray(attributes)) {
      for (const attr of attributes) {
        await ProductVariantAttributeValue.create(
          {
            product_variant_id: variant_id,
            product_attribute_id: attr.attribute_id,
            value: attr.value,
          },
          { transaction: t }
        );
      }
    }

    // Xóa ảnh cũ và thêm ảnh mới
    await VariantImage.destroy({
      where: { variant_id },
      transaction: t,
    });

    if (Array.isArray(images)) {
      for (const image of images) {
        const url = typeof image === "string" ? image : image?.url || "";
        if (url) {
          await VariantImage.create(
            {
              variant_id,
              image_url: url,
            },
            { transaction: t }
          );
        }
      }
    }

    await t.commit();
    res.status(200).json({
      message: "Cập nhật biến thể thành công",
      variant,
    });
  } catch (error) {
    await t.rollback();
    console.error("Lỗi khi cập nhật biến thể:", error);
    res.status(500).json({ error: error.message });
  }
}


  // Thêm ảnh mới cho biến thể
  static async addVariantImages(req, res) {
    try {
      const { variant_id } = req.params;
      const { images } = req.body;

      // Kiểm tra biến thể tồn tại
      const variant = await ProductVariant.findByPk(variant_id);
      if (!variant) {
        return res.status(404).json({ message: "Biến thể không tồn tại" });
      }

      // Tạo ảnh cho biến thể
      const createdImages = [];
      if (Array.isArray(images)) {
        for (const imageUrl of images) {
          const newImage = await VariantImage.create({
            variant_id,
            image_url: imageUrl,
          });
          createdImages.push(newImage);
        }
      }

      res.status(201).json({
        message: "Thêm ảnh biến thể thành công",
        data: createdImages,
      });
    } catch (error) {
      console.error("Lỗi khi thêm ảnh biến thể:", error);
      res.status(500).json({ error: error.message });
    }
  }

  // Cập nhật sản phẩm (chỉ thông tin cơ bản)
  static async update(req, res) {
  try {
    const { id } = req.params;
    const {
      name,
      slug,
      description,
      short_description, // ✅ thêm dòng này
      brand_id,
      category_id,
      thumbnail,
      status,
      publication_status,
    } = req.body;

    const product = await Product.findByPk(id);
    if (!product) {
      return res.status(404).json({ message: "Sản phẩm không tồn tại" });
    }

    if (name !== undefined) product.name = name;
    if (slug !== undefined) product.slug = slug;
    if (description !== undefined) product.description = description;
    if (short_description !== undefined) product.short_description = short_description; // ✅ gán giá trị
    if (brand_id !== undefined) product.brand_id = brand_id;
    if (category_id !== undefined) product.category_id = category_id;
    if (thumbnail !== undefined) product.thumbnail = thumbnail;
    if (status !== undefined) product.status = status;
    if (publication_status !== undefined) product.publication_status = publication_status;

    await product.save();

    res
      .status(200)
      .json({ message: "Cập nhật sản phẩm thành công", product });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Nhớ import Op
// const { Op } = require('sequelize');

static async searchProducts(req, res) {
  try {
    // --------- params & defaults ----------
    const page  = Math.max(parseInt(req.query.page)  || 1, 1);
    const limit = Math.max(parseInt(req.query.limit) || 10, 1);
    const offset = (page - 1) * limit;

    const rawSearch = (req.query.searchTerm || "").trim();
    const categoryId = req.query.categoryId ? parseInt(req.query.categoryId) : null;
    const brandId    = req.query.brandId    ? parseInt(req.query.brandId)    : null;
    const publicationStatus = (req.query.publicationStatus || "").trim(); // 'published' | 'draft' | ''

    // --------- where builder ----------
    const whereConditions = [];

    // Lọc theo tên sản phẩm với nhiều từ khóa rời (AND)
    if (rawSearch) {
      const keywords = rawSearch.split(/\s+/); // VD: "Samsung Watch8" -> ["Samsung","Watch8"]
      keywords.forEach((kw) => {
        whereConditions.push({
          name: { [Op.like]: `%${kw}%` },
        });
      });
    }

    if (categoryId) {
      whereConditions.push({ category_id: categoryId });
    }

    if (brandId) {
      whereConditions.push({ brand_id: brandId });
    }

    if (publicationStatus) {
      whereConditions.push({ publication_status: publicationStatus });
    }

    const where = whereConditions.length ? { [Op.and]: whereConditions } : {};

    // --------- count ----------
    const totalProducts = await Product.count({ where });

    // --------- query data ----------
    const products = await Product.findAll({
      where,
      order: [["created_at", "DESC"]],
      limit,
      offset,
      include: [
        {
          model: ProductVariant,
          as: "variants",
          include: [
            {
              model: ProductVariantAttributeValue,
              as: "attributeValues",
              include: [{ model: ProductAttribute, as: "attribute" }],
              required: false,
            },
            {
              model: VariantImage,
              as: "images",
              required: false,
            },
          ],
          required: false,
        },
        { model: CategoryModel, as: "category", attributes: ["id", "name"] },
        { model: BrandModel,    as: "brand",    attributes: ["id", "name"]  },
      ],
    });

    if (!products.length) {
      return res.status(200).json({
        status: 200,
        message: "Không tìm thấy sản phẩm nào.",
        data: [],
        pagination: {
          currentPage: page,
          totalPages: 0,
          totalProducts: 0,
        },
        totalVariants: 0,
      });
    }

    // Tính variantCount cho mỗi product + tổng biến thể
    const data = products.map(p => {
      const j = p.toJSON();
      j.variantCount = j.variants?.length || 0;
      return j;
    });

    const totalVariants = products.reduce((sum, p) => sum + (p.variants?.length || 0), 0);

    // --------- response ----------
    return res.status(200).json({
      status: 200,
      message: "Tìm kiếm sản phẩm thành công",
      data,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalProducts / limit),
        totalProducts,
      },
      totalVariants,
    });
  } catch (error) {
    console.error("searchProducts error:", error);
    return res.status(500).json({ error: error.message });
  }
}







  // Xoá sản phẩm và các biến thể
  static async delete(req, res) {
    const t = await Product.sequelize.transaction();
    try {
      const { id } = req.params;

      const product = await Product.findByPk(id);
      if (!product) {
        return res.status(404).json({ message: "Sản phẩm không tồn tại" });
      }

      const variants = await ProductVariant.findAll({
        where: { product_id: id },
      });

      for (const variant of variants) {
        await ProductVariantAttributeValue.destroy({
          where: { product_variant_id: variant.id },
          transaction: t,
        });
        await VariantImage.destroy({
          where: { variant_id: variant.id },
          transaction: t,
        });
      }

      await ProductVariant.destroy({
        where: { product_id: id },
        transaction: t,
      });
      await Product.destroy({ where: { id }, transaction: t });

      await t.commit();
      res.status(200).json({ message: "Xoá sản phẩm thành công" });
    } catch (error) {
      await t.rollback();
      res.status(500).json({ error: error.message });
    }
  }
  // Xóa 1 ảnh cụ thể của biến thể theo image_id
  static async deleteSingleVariantImage(req, res) {
    try {
      const { image_id } = req.params;

      const image = await VariantImage.findByPk(image_id);
      if (!image) {
        return res.status(404).json({ message: "Ảnh không tồn tại" });
      }

      await image.destroy();

      res.status(200).json({ message: "Xóa ảnh thành công" });
    } catch (error) {
      console.error("Lỗi khi xóa ảnh:", error);
      res.status(500).json({ error: error.message });
    }
  }
  // Xóa một biến thể sản phẩm theo variant_id
static async deleteVariant(req, res) {
  const t = await ProductVariant.sequelize.transaction();
  try {
    const { variant_id } = req.params;

    // Tìm biến thể
    const variant = await ProductVariant.findByPk(variant_id);
    if (!variant) {
      return res.status(404).json({ message: "Biến thể không tồn tại" });
    }

    await ProductVariantAttributeValue.destroy({
      where: { product_variant_id: variant_id },
      transaction: t,
    });

    await VariantImage.destroy({
      where: { variant_id },
      transaction: t,
    });

    await ProductVariant.destroy({
      where: { id: variant_id },
      transaction: t,
    });

    await t.commit();
    res.status(200).json({ message: "Xoá biến thể thành công" });
  } catch (error) {
    await t.rollback();
    console.error("Lỗi khi xoá biến thể:", error);
    res.status(500).json({ error: error.message });
  }
}
// Lấy chi tiết biến thể theo variant_id
static async getVariantById(req, res) {
  try {
    const { variant_id } = req.params;
    const now = new Date();

    const variant = await ProductVariant.findByPk(variant_id, {
      include: [
        {
          model: ProductVariantAttributeValue,
          as: "attributeValues",
          include: [{ model: ProductAttribute, as: "attribute" }],
        },
        { model: VariantImage, as: "images" },
        {
          model: Product,
          as: "product",
          attributes: ["id", "name", "slug", "thumbnail"],
        },
        // 👉 Join sang bảng PromotionProduct
        {
          model: PromotionProduct,
          as: "promotionProducts",
          required: false,
          include: [
            {
              model: Promotion, // JOIN sang bảng promotion
              as: "promotion",
              attributes: ["id", "code", "status", "start_date", "end_date"],
              required: false,
              where: {
                status: ["active","upcoming"],
                start_date: { [Op.lte]: now },
                end_date: { [Op.gte]: now },
              },
            },
          ],
        },
      ],
    });

    if (!variant) {
      return res.status(404).json({ message: "Biến thể không tồn tại" });
    }

    const data = variant.toJSON();
    // Kiểm tra nếu có promotion đang hiệu lực
    data.has_promotion = (data.promotionProducts || []).some(
      (pp) => pp.promotion != null
    );

    return res.status(200).json({
      status: 200,
      message: "Lấy chi tiết biến thể thành công",
      data,
    });
  } catch (error) {
    console.error("Lỗi khi lấy chi tiết biến thể:", error);
    return res.status(500).json({ error: error.message });
  }
}



static async deleteAttributeValueById (req, res){
  try {
    const { id } = req.params;

    const deleted = await ProductVariantAttributeValue.destroy({
      where: { id }
    });

    if (deleted === 0) {
      return res.status(404).json({ message: 'Không tìm thấy thuộc tính để xoá' });
    }

    res.status(200).json({ message: 'Xoá thuộc tính thành công' });
  } catch (error) {
    console.error('Lỗi xoá thuộc tính:', error);
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
};


static async getAllVariants(req, res) {
  try {
    const variants = await ProductVariant.findAll({
      where: {
        is_auction_only: 0, // Chỉ lấy các biến thể không phải đấu giá
      },
      include: [
        {
          model: Product,
          as: 'product',
          attributes: ['id', 'name', 'publication_status'],
          where: { publication_status: 'published',
            status: '1'  // Chỉ lấy sản phẩm đang hoạt động
           }, // ✅ chỉ lấy sản phẩm đã xuất bản
        }
      ],
      order: [['created_at', 'DESC']],
    });

    res.status(200).json({
      status: 200,
      message: "Lấy danh sách biến thể sản phẩm thành công",
      data: variants,
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}



static async deleteImagesClauding(req, res) {
  const { public_id } = req.body;

  try {
    await cloudinary.uploader.destroy(public_id);
    res.json({ message: "Xóa ảnh thành công" });
  } catch (error) {
    console.error("Lỗi xóa ảnh:", error);
    res.status(500).json({ error: "Lỗi xóa ảnh trên Cloudinary" });
  }
}

static async getAllActiveBrands(req, res) {
    try {
        const activeBrands = await BrandModel.findAll({
            where: { status: 'active' },
            order: [['created_at', 'DESC']],
        });

        res.status(200).json({
            status: 200,
            message: "Lấy danh sách thương hiệu hoạt động thành công",
            data: activeBrands,
        });
    } catch (error) {
        console.error("Lỗi khi lấy danh sách thương hiệu hoạt động:", error);
        res.status(500).json({ error: error.message });
    }
}
static async getAllActiveCategories(req, res) {
    try {
        const activeCategories = await CategoryModel.findAll({
            where: { status: 'active' },
            order: [['created_at', 'DESC']],
        });

        res.status(200).json({
            status: 200,
            message: "Lấy danh sách danh mục hoạt động thành công",
            data: activeCategories,
        });
    } catch (error) {
        console.error("Lỗi khi lấy danh sách danh mục hoạt động:", error);
        res.status(500).json({ error: error.message });
    }
}



}

module.exports = ProductController;
