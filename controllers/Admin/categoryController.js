const CategoryModel = require('../../models/categoriesModel');
const { Op } = require('sequelize');

class CategoryController {
  static async getAll(req, res) {
    const { searchTerm = '', page = 1, limit = 10 } = req.query;
    const pageNumber = parseInt(page);
    const pageSize = parseInt(limit);
    const offset = (pageNumber - 1) * pageSize;

    try {
      const whereClause = searchTerm
        ? {
          name: {
            [Op.like]: `%${searchTerm}%`,
          },
        }
        : {};
      const { rows: categories, count: totalItems } = await CategoryModel.findAndCountAll({
        where: whereClause,
        limit: pageSize,
        offset: offset,
        order: [['created_at', 'DESC']],
      });

      const totalPages = Math.ceil(totalItems / pageSize);

      res.status(200).json({
        status: 200,
        message: "Lấy danh sách danh mục thành công",
        data: categories,
        pagination: {
          totalItems,
          totalPages,
          currentPage: pageNumber,
          perPage: pageSize,
        },
      });
    } catch (error) {
      console.error("Lỗi khi lấy danh sách danh mục:", error);
      res.status(500).json({
        status: 500,
        message: "Lỗi server khi lấy danh sách danh mục.",
      });
    }
  }



  static async create(req, res) {
    let { name, slug, description, status } = req.body;
    if (!name || !description) {
      return res.status(400).json({ status: 400, message: "Tên và mô tả danh mục là bắt buộc.", });
    }
    const normalizedName = name.trim().replace(/\s+/g, " ").toLowerCase();
    try {
      const existingCategory = await CategoryModel.findOne({
        where: {
          name: normalizedName,
        },
      });
      if (existingCategory) {
        return res.status(409).json({ status: 409, message: "Tên danh mục đã tồn tại.", });
      }
      const newCategory = await CategoryModel.create({ name: normalizedName, slug, description, status, });
      return res.status(201).json({ status: 201, message: "Thêm danh mục thành công.", data: newCategory, });
    } catch (error) {
      console.error("Lỗi khi thêm danh mục:", error);
      return res.status(500).json({ status: 500, message: "Lỗi server khi thêm danh mục.", });
    }
  }


  static async getById(req, res) {
    const { id } = req.params;
    try {
      const category = await CategoryModel.findByPk(id);
      if (!category) {
        return res.status(404).json({ message: "Danh mục không tồn tại." });
      }
      res.status(200).json({ data: category });
    } catch (error) {
      res.status(500).json({ message: "Lỗi server." });
    }
  }



  static async update(req, res) {
    const { id } = req.params;
    const { name, slug, description, status } = req.body;

    if (!name || !description) {
      return res.status(400).json({
        status: 400,
        message: "Tên và mô tả danh mục là bắt buộc.",
      });
    }

    try {
      const category = await CategoryModel.findByPk(id);
      if (!category) {
        return res.status(404).json({
          status: 404,
          message: "Danh mục không tồn tại.",
        });
      }
      category.name = name;
      category.slug = slug;
      category.description = description;
      category.status = status;
      await category.save();
      res.status(200).json({
        status: 200,
        message: "Cập nhật danh mục thành công.",
        data: category,
      });
    } catch (error) {
      console.error("Lỗi khi cập nhật danh mục:", error);
      res.status(500).json({
        status: 500,
        message: "Lỗi server khi cập nhật danh mục.",
      });
    }
  }

  static async delete(req, res) {
    const { id } = req.params;
    try {
      const category = await CategoryModel.findByPk(id);
      if (!category) {
        return res.status(404).json({
          status: 404,
          message: "Danh mục không tồn tại.",
        });
      }
      const relatedProducts = await category.getProducts();
      if (relatedProducts.length > 0) {
        return res.status(400).json({
          status: 400,
          message: "Không thể xóa danh mục vì có sản phẩm liên quan.",
        });
      }
      await category.destroy();
      res.status(200).json({
        status: 200,
        message: `Xóa danh mục "${category.name}" thành công.`,
      });
    } catch (error) {
      console.error("Lỗi khi xóa danh mục:", error);
      if (error.name === "SequelizeForeignKeyConstraintError") {
        return res.status(400).json({
          status: 400,
          message: "Không thể xóa vì có dữ liệu liên quan sử dụng danh mục này.",
        });
      }

      res.status(500).json({
        status: 500,
        message: "Lỗi server khi xóa danh mục.",
      });
    }
  }
}

module.exports = CategoryController;
