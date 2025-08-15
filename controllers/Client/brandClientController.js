const BrandModel = require('../../models/brandsModel');
const ProductModel = require('../../models/productsModel');
const ProductVariantModel = require('../../models/productVariantsModel'); // ✅ thêm import
const { Op } = require('sequelize');

class brandClientController {
  static async getAll(req, res) {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const offset = (page - 1) * limit;

      const { status = 'active', searchTerm } = req.query;
      const whereClause = {};

      // 🔎 Tìm theo tên/country
      if (searchTerm) {
        whereClause[Op.or] = [
          { name: { [Op.like]: `%${searchTerm}%` } },
          { country: { [Op.like]: `%${searchTerm}%` } },
        ];
      }

      // 🟢 Chỉ lấy brand theo status hợp lệ (mặc định active)
      const validStatuses = ['active', 'inactive'];
      if (status !== 'all' && validStatuses.includes(status)) {
        whereClause.status = status;
      }

      // ❗ Quan trọng: chỉ giữ brand có ÍT NHẤT 1 sản phẩm
      // mà sản phẩm đó có ÍT NHẤT 1 biến thể thường (is_auction_only = 0)
      const { count, rows } = await BrandModel.findAndCountAll({
        where: whereClause,
        include: [
          {
            model: ProductModel,
            as: 'products',
            required: true,          // inner join -> brand phải có product
            attributes: [],          // không trả danh sách product
            where: {
              // (tuỳ bạn) có thể thêm điều kiện product status/publication nếu cần
              // status: 'active',
              // publication_status: 'published',
            },
            include: [
              {
                model: ProductVariantModel,
                as: 'variants',
                required: true,       // inner join -> product phải có variant thường
                attributes: [],
                where: { is_auction_only: 0 }, // ✅ chỉ nhận biến thể thường
              },
            ],
          },
        ],
        order: [['created_at', 'DESC']],
        limit,
        offset,
        distinct: true, // count chính xác khi có include
        subQuery: false, // giúp tối ưu kèm limit/offset + include sâu
      });

      return res.status(200).json({
        status: 200,
        message: 'Lấy danh sách thương hiệu có (ít nhất 1) biến thể thường thành công',
        data: rows,
        pagination: {
          total: count,
          totalPages: Math.ceil(count / limit),
          currentPage: page,
          limit,
        },
      });
    } catch (error) {
      console.error('Lỗi khi lấy danh sách thương hiệu:', error);
      res.status(500).json({ status: 500, error: error.message });
    }
  }
}

module.exports = brandClientController;
