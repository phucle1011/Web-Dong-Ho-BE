const CategoryModel = require('../../models/categoriesModel');
const ProductModel = require('../../models/productsModel');
const { Op } = require('sequelize');

class CategoryController {
  static async getCategories(req, res) {
    try {
      const {
        searchTerm = '',
        page = 1,
        limit = 10,
        status = 'active',
      } = req.query;

      const currentPage = Math.max(parseInt(page, 10), 1);
      const currentLimit = Math.max(parseInt(limit, 10), 1);
      const offset = (currentPage - 1) * currentLimit;

      const where = {};
      if (searchTerm) {
        where[Op.or] = [
          { name: { [Op.like]: `%${searchTerm}%` } },
          { slug: { [Op.like]: `%${searchTerm}%` } },
        ];
      }

      if (status && status !== 'all') {
        where.status = status;
      }

      const { count, rows } = await CategoryModel.findAndCountAll({
        where,
        include: [
          {
            model: ProductModel,
            as: 'products',
            required: true, // ✅ chỉ lấy danh mục có ít nhất 1 sản phẩm
            attributes: [],
          },
        ],
        attributes: ['id', 'name', 'slug', 'description', 'status', 'created_at', 'updated_at'],
        limit: currentLimit,
        offset,
        order: [['created_at', 'DESC']],
        distinct: true,
      });

      const formatted = rows.map((category) => ({
        id: category.id,
        name: category.name,
        slug: category.slug,
        description: category.description || '',
        status: category.status,
        createdAt: category.created_at,
        updatedAt: category.updated_at,
      }));

      res.status(200).json({
        status: 200,
        message: 'Lấy danh sách danh mục thành công',
        data: formatted,
        pagination: {
          totalPages: Math.ceil(count / currentLimit),
          currentPage,
          totalRecords: count,
        },
      });
    } catch (error) {
      console.error('Lỗi khi lấy danh sách danh mục:', error);
      res.status(500).json({ message: 'Lỗi server', error: error.message });
    }
  }
}

module.exports = CategoryController;
