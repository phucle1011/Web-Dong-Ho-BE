const { Op, fn, col } = require("sequelize");
const BlogCategory = require('../../models/blogsCategoryModel');
const Blog = require('../../models/blogsModel');
const slugify = require('slugify');
const sequelize = require('sequelize');

class BlogCategoryController {
static async getAll(req, res) {
  try {
    const { status, page = 1, limit = 10, searchTerm = "" } = req.query;

    const whereCondition = {};
    if (status !== undefined) whereCondition.status = status;
    if (searchTerm) whereCondition.name = { [Op.like]: `%${searchTerm}%` };

    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { count, rows } = await BlogCategory.findAndCountAll({
      where: whereCondition,
      limit: parseInt(limit),
      offset,
      order: [["id", "DESC"]],
      distinct: true,                 // <— tránh nhân bản count do JOIN
      include: [{
        model: Blog,
        attributes: ["id"],           // <— phải lấy ít nhất 1 field để có mảng Blogs
        required: false
      }]
    });

    const categoriesWithBlogCount = rows.map((category) => {
      const json = category.toJSON();
      return {
        ...json,
        blogCount: Array.isArray(json.Blogs) ? json.Blogs.length : 0
      };
    });

    res.json({
      success: true,
      data: categoriesWithBlogCount,
      pagination: {
        totalItems: typeof count === "number" ? count : count.length, // phòng khi driver trả mảng
        totalPages: Math.ceil((typeof count === "number" ? count : count.length) / limit),
        currentPage: parseInt(page),
      }
    });
  } catch (error) {
    console.error("Lỗi server:", error);
    res.status(500).json({ success: false, message: "Lỗi server", error });
  }
}




  static async getById(req, res) {
  try {
    const { id } = req.params;
    const category = await BlogCategory.findByPk(id);
    if (!category) {
      return res.status(404).json({ success: false, message: "Không tìm thấy danh mục" });
    }
    res.status(200).json({ success: true, data: category });
  } catch (error) {
    res.status(500).json({ success: false, message: "Lỗi máy chủ", error });
  }
}
  static async create(req, res) {
  try {
    const { name } = req.body;
    const slug = slugify(name, { lower: true }).trim();
    const nameNormalized = name.trim().toLowerCase();

  
    const existing = await BlogCategory.findOne({
      where: {
        [Op.or]: [
          sequelize.where(sequelize.fn('lower', sequelize.col('name')), nameNormalized),
          sequelize.where(sequelize.fn('lower', sequelize.col('slug')), slug)
        ]
      }
    });

    if (existing) {
      return res.status(409).json({ success: false, message: "Tên đã tồn tại" });
    }

    const category = await BlogCategory.create({ name: name.trim(), slug });
    res.json({ success: true, message: "Tạo danh mục thành công", data: category });
  } catch (error) {
    res.status(400).json({ success: false, message: "Tạo thất bại", error });
  }
}


  static async update(req, res) {
  try {
    const { id } = req.params;
    const { name, status } = req.body;
    const slug = slugify(name, { lower: true }).trim();
    const nameNormalized = name.trim().toLowerCase();

    const category = await BlogCategory.findByPk(id);
    if (!category) {
      return res.status(404).json({ success: false, message: "Không tìm thấy danh mục" });
    }

    
    const existing = await BlogCategory.findOne({
      where: {
        [Op.and]: [
          {
            id: { [Op.ne]: id } 
          },
          {
            [Op.or]: [
              sequelize.where(sequelize.fn('lower', sequelize.col('name')), nameNormalized),
              sequelize.where(sequelize.fn('lower', sequelize.col('slug')), slug)
            ]
          }
        ]
      }
    });

    if (existing) {
      return res.status(409).json({ success: false, message: "Tên hoặc slug đã tồn tại" });
    }

    await category.update({ name: name.trim(), slug, status });
    res.json({ success: true, message: "Cập nhật thành công", data: category });
  } catch (error) {
    res.status(400).json({ success: false, message: "Cập nhật thất bại", error });
  }
}


  static async delete(req, res) {
  try {
    const { id } = req.params;

    const category = await BlogCategory.findByPk(id);
    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy danh mục"
      });
    }

    // Kiểm tra xem có bài viết nào liên quan không
    const blogCount = await Blog.count({ where: { blogCategory_id: id } });
    if (blogCount > 0) {
      return res.status(400).json({
        success: false,
        message: "Không thể xóa danh mục đang có bài viết"
      });
    }

    await category.destroy();

    return res.json({
      success: true,
      message: "Xóa danh mục thành công"
    });
  } catch (error) {
    console.error("Lỗi khi xóa danh mục:", error);
    return res.status(500).json({
      success: false,
      message: "Xóa thất bại",
      error
    });
  }
}
}

module.exports = BlogCategoryController;
