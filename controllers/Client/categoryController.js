const CategoryModel = require('../../models/categoriesModel');
const ProductModel = require('../../models/productsModel'); // vẫn cần để ensure associations đã khai báo, nhưng không bắt buộc include
const { Op, Sequelize } = require('sequelize');

class CategoryController {
  static async getCategories(req, res) {
    try {
      const {
        searchTerm = '',
        page = 1,
        limit = 10,
        status = 'active',
      } = req.query;

      const currentPage  = Math.max(parseInt(page, 10)  || 1, 1);
      const currentLimit = Math.max(parseInt(limit, 10) || 10, 1);
      const offset       = (currentPage - 1) * currentLimit;

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

      // Tên bảng thực tế (tránh hard-code)
      const catTable = CategoryModel.getTableName();        // 'categories'
      const prodTable = ProductModel.getTableName();        // 'products'
      // Nếu bảng variant tên khác, thay 'product_variants' bên dưới cho đúng
      const variantTable = 'product_variants';

      // Điều kiện: category được giữ nếu TỒN TẠI 1 product + 1 variant "thường"
      const existsRegularVariant = Sequelize.literal(`
        EXISTS (
          SELECT 1
          FROM ${prodTable} p
          JOIN ${variantTable} v ON v.product_id = p.id
          WHERE p.category_id = ${catTable}.id
            AND (v.is_auction_only = 0 OR v.is_auction_only IS NULL)
        )
      `);

      const { count, rows } = await CategoryModel.findAndCountAll({
        where: {
          ...where,
          [Op.and]: existsRegularVariant, // ⬅️ giữ category nếu có biến thể thường
        },
        attributes: ['id', 'name', 'slug', 'description', 'status', 'created_at', 'updated_at'],
        order: [['created_at', 'DESC']],
        limit: currentLimit,
        offset,
        distinct: true,
        subQuery: false,
      });

      const data = rows.map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        description: c.description || '',
        status: c.status,
        createdAt: c.created_at,
        updatedAt: c.updated_at,
      }));

      return res.status(200).json({
        status: 200,
        message: 'Lấy danh sách danh mục thành công',
        data,
        pagination: {
          totalPages: Math.ceil(count / currentLimit),
          currentPage,
          totalRecords: count,
          limit: currentLimit,
        },
      });
    } catch (error) {
      console.error('Lỗi khi lấy danh sách danh mục:', error);
      return res.status(500).json({ message: 'Lỗi server', error: error.message });
    }
  }
}

module.exports = CategoryController;
