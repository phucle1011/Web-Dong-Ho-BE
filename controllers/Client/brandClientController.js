const BrandModel = require('../../models/brandsModel');
const ProductModel = require('../../models/productsModel'); // ✅ sửa lại import đúng
const { Op } = require("sequelize");

class brandClientController {
  static async getAll(req, res) {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const offset = (page - 1) * limit;

      const { status = 'active', searchTerm } = req.query;
      const whereClause = {};

      // ✅ Tìm kiếm theo tên hoặc quốc gia
      if (searchTerm) {
        whereClause[Op.or] = [
          { name: { [Op.like]: `%${searchTerm}%` } },
          { country: { [Op.like]: `%${searchTerm}%` } },
        ];
      }

      // ✅ Chỉ lấy thương hiệu có status là active
      const validStatuses = ['active', 'inactive'];
      if (status !== 'all' && validStatuses.includes(status)) {
        whereClause.status = status;
      }

      // ✅ Truy vấn thương hiệu có ít nhất 1 sản phẩm
      const { count, rows } = await BrandModel.findAndCountAll({
        where: whereClause,
        include: [
          {
            model: ProductModel,
            as: 'products',
            required: true,          // chỉ lấy brand có sản phẩm
            attributes: [],          // không cần trả danh sách sản phẩm
          },
        ],
        order: [['created_at', 'DESC']],
        limit,
        offset,
        distinct: true,             // để count chính xác
      });

      return res.status(200).json({
        status: 200,
        message: "Lấy danh sách thương hiệu có sản phẩm thành công",
        data: rows,
        pagination: {
          total: count,
          totalPages: Math.ceil(count / limit),
          currentPage: page,
          limit,
        },
      });
    } catch (error) {
      console.error("Lỗi khi lấy danh sách thương hiệu:", error);
      res.status(500).json({ status: 500, error: error.message });
    }
  }
}

module.exports = brandClientController;
