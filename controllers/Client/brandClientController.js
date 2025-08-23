const BrandModel = require('../../models/brandsModel');
const ProductModel = require('../../models/productsModel');
const ProductVariantModel = require('../../models/productVariantsModel');
const { Op } = require('sequelize');

class brandClientController {
  static async getAll(req, res) {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const offset = (page - 1) * limit;

      const { status = 'active', searchTerm, hasProduct = true } = req.query;
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

      let includeOptions = [];
      
      // Nếu cần lọc brand có sản phẩm (mặc định là true)
      if (hasProduct === 'true' || hasProduct === true) {
        includeOptions = [
          {
            model: ProductModel,
            as: 'products',
            required: true,
            attributes: [],
            where: {
              // Thêm điều kiện product nếu cần
              // status: 'active',
              // publication_status: 'published',
            },
            include: [
              {
                model: ProductVariantModel,
                as: 'variants',
                required: true,
                attributes: [],
                where: {
                  // ✅ Lấy tất cả biến thể KHÔNG PHẢI đấu giá
                  is_auction_only: 0
                }
              }
            ]
          }
        ];
      }

      const { count, rows } = await BrandModel.findAndCountAll({
        where: whereClause,
        include: includeOptions,
        order: [['name', 'ASC']], // Sắp xếp theo tên để nhất quán
        limit,
        offset,
        distinct: true,
        subQuery: false,
      });

      return res.status(200).json({
        status: 200,
        message: 'Lấy danh sách thương hiệu thành công',
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