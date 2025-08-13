// controllers/BlogController.js
const { Op, col } = require("sequelize");
const Blog = require("../../models/blogsModel");
const User = require("../../models/usersModel");
const BlogCategory = require("../../models/blogsCategoryModel");

class BlogController {
  static async getAllBlogs(req, res) {
    try {
      const { category } = req.query;

      const whereBlog = {};
      const whereCategory = { status: 1 };

      if (category) {
        whereCategory.slug = category;
      }

      const blogs = await Blog.findAll({
        where: whereBlog,
        order: [["created_at", "DESC"]],
        include: [
          {
            model: BlogCategory,
            as: "category",
            attributes: ["id", "name", "slug"],
            where: whereCategory,
            required: true,
          },
          {
            model: User,
            as: "user",
            attributes: ["id", "name"],
          },
        ],
      });

      const result = blogs.map((blog) => ({
        id: blog.id,
        user_id: blog.user_id,
        user_name: blog.user?.name || "",
        title: blog.title,
        image_url: blog.image_url,
        content: blog.content,
        created_at: blog.created_at,
        updated_at: blog.updated_at,
        meta_description: blog.meta_description,
        focus_keyword: blog.focus_keyword,
        blog_category: blog.category?.name || null,
        blog_category_slug: blog.category?.slug || null,
      }));

      return res.status(200).json({ blogs: result });
    } catch (error) {
      console.error("Error fetching blogs:", error);
      return res.status(500).json({ message: "Internal Server Error" });
    }
  }

  static async getBlogById(req, res) {
    const { id } = req.params;
    try {
      const blog = await Blog.findByPk(id, {
        include: [
          { model: User, as: "user", attributes: ["id", "name"] },
          { model: BlogCategory, as: "category", attributes: ["id", "name", "slug"] },
        ],
      });

      if (!blog) {
        return res.status(404).json({ message: "Blog not found" });
      }

      const result = {
        id: blog.id,
        user_id: blog.user_id,
        user_name: blog.user?.name || "",
        title: blog.title,
        image_url: blog.image_url,
        content: blog.content,
        created_at: blog.created_at,
        updated_at: blog.updated_at,
        meta_description: blog.meta_description,
        focus_keyword: blog.focus_keyword,
        blog_category: blog.category?.name || null,
        blog_category_slug: blog.category?.slug || null,
      };

      return res.status(200).json(result);
    } catch (error) {
      console.error("Error fetching blog by id:", error);
      return res.status(500).json({ message: "Internal Server Error" });
    }
  }

  static async searchBlogs(req, res) {
    const q = req.query.q || "";
    if (!q.trim()) {
      return res.status(200).json({ blogs: [] });
    }

    try {
      const blogs = await Blog.findAll({
        where: { title: { [Op.like]: `%${q}%` } },
        order: [["created_at", "DESC"]],
      });

      return res.status(200).json({ blogs });
    } catch (error) {
      console.error("Error searching blogs:", error);
      return res.status(500).json({ message: "Internal Server Error" });
    }
  }

  // Tăng view: công khai
  static async trackView(req, res) {
    try {
      const idStr = req.params.id;
      const blogId = parseInt(idStr, 10);
      if (!Number.isInteger(blogId) || blogId <= 0) {
        return res.status(400).json({ success: false, message: "ID bài viết không hợp lệ." });
      }

      // Tăng view an toàn (tránh race condition)
      const [affected] = await Blog.increment("view_count", {
        by: 1,
        where: { id: blogId },
      });

      if (!affected || (Array.isArray(affected) && affected[0] === 0)) {
        return res.status(404).json({ success: false, message: "Không tìm thấy bài viết." });
      }

      const blog = await Blog.findByPk(blogId, { attributes: ["id", "view_count"] });
      return res.json({
        success: true,
        message: "Tăng lượt xem thành công.",
        view_count: blog?.view_count ?? null,
      });
    } catch (error) {
      console.error("Lỗi khi tăng view_count (public):", error);
      return res.status(500).json({ success: false, message: "Lỗi server." });
    }
  }

  // Chỉ bài có view_count > 0
  static async getHot(req, res) {
    try {
      const limit = Math.min(parseInt(req.query.limit, 10) || 4, 50);
      const hotBlogs = await Blog.findAll({
        where: { view_count: { [Op.gt]: 0 } },
        include: [{ model: User, as: "user", attributes: [] }],
        attributes: [
          "id",
          "title",
          "image_url",
          "created_at",
          "view_count",
          [col("user.name"), "user_name"],
        ],
        order: [["view_count", "DESC"], ["id", "DESC"]],
        limit,
      });

      return res.json({ success: true, blogs: hotBlogs });
    } catch (error) {
      console.error("Lỗi khi lấy hot blogs (public):", error);
      return res.status(500).json({ success: false, message: "Lỗi server." });
    }
  }
}

module.exports = BlogController;
