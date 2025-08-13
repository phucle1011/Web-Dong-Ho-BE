const { fn, col, literal } = require('sequelize');
const { Op } = require('sequelize');
const PromotionModel = require('../../models/promotionsModel');
const UserModel = require('../../models/usersModel');
const OrderModel = require('../../models/ordersModel');

class PromotionController {
  static async getAll(req, res) {
    const {
      searchTerm = '',
      page = 1,
      limit = 10,
      code,
      status,
      startDate,
      endDate,
      discount_type,
      quantity,
      special_promotion,
    } = req.query;

    const currentPage = parseInt(page, 10);
    const perPage = parseInt(limit, 10);
    const offset = (currentPage - 1) * perPage;

    try {

      const baseWhereClause = {};

      if (searchTerm) {
        baseWhereClause.name = {
          [Op.and]: [
            { [Op.not]: null },
            { [Op.like]: `%${searchTerm}%` },
          ],
        };
      }

      if (code) {
        baseWhereClause.code = {
          [Op.like]: `%${code}%`,
        };
      }

      if (startDate) {
        baseWhereClause.start_date = {
          ...(baseWhereClause.start_date || {}),
          [Op.gte]: new Date(startDate),
        };
      }

      if (endDate) {
        baseWhereClause.end_date = {
          ...(baseWhereClause.end_date || {}),
          [Op.lte]: new Date(endDate),
        };
      }

      if (discount_type) {
        baseWhereClause.discount_type = discount_type;
      }

      if (quantity !== undefined) {
        baseWhereClause.quantity = {
          [Op.gte]: parseInt(quantity, 10),
        };
      }

      const allPromotions = await PromotionModel.findAll({
        where: baseWhereClause,
        order: [['created_at', 'DESC']],
      });

      const now = new Date();
      const statusCounts = {
        all: 0,
        active: 0,
        expired: 0,
        upcoming: 0,
        exhausted: 0,
        inactive: 0,
        special: 0,
      };

      for (const promo of allPromotions) {
        let newStatus = promo.status;

        if (promo.status === 'inactive') {
          newStatus = 'inactive';
        } else if (promo.quantity === 0) {
          newStatus = 'exhausted';
        } else if (now < promo.start_date) {
          newStatus = 'upcoming';
        } else if (now >= promo.start_date && now <= promo.end_date) {
          newStatus = 'active';
        } else {
          newStatus = 'expired';
        }

        const updateData = {};
        if (promo.status !== newStatus) {
          updateData.status = newStatus;
        }

        if (newStatus === 'exhausted' && promo.quantity !== 0) {
          updateData.quantity = 0;
        }

        if (Object.keys(updateData).length > 0) {
          await promo.update(updateData);
          Object.assign(promo, updateData);
        }

        statusCounts[newStatus] = (statusCounts[newStatus] || 0) + 1;

        if (
          promo.special_promotion &&
          promo.status === 'active' &&
          promo.quantity > 0 &&
          new Date(promo.start_date) <= now &&
          new Date(promo.end_date) >= now
        ) {
          statusCounts.special = (statusCounts.special || 0) + 1;
        }

      }

      statusCounts.all = allPromotions.length;

      let filteredPromotions = allPromotions;
      if (special_promotion !== undefined) {
        const isSpecial = special_promotion === 'true';
        filteredPromotions = filteredPromotions.filter(promo => promo.special_promotion === isSpecial);
      }

      if (status) {
        const statusArray = typeof status === 'string' ? status.split(',') : [status];
        filteredPromotions = filteredPromotions.filter(promo =>
          statusArray.includes(promo.status)
        );
      }

      const totalFilteredItems = filteredPromotions.length;
      const paginatedPromotions = filteredPromotions.slice(offset, offset + perPage);

      res.status(200).json({
        success: true,
        data: paginatedPromotions,
        pagination: {
          totalItems: totalFilteredItems,
          currentPage,
          totalPages: Math.ceil(totalFilteredItems / perPage),
        },
        statusCounts,
      });
    } catch (error) {
      console.error("Lỗi khi lấy danh sách khuyến mãi:", error.message, error.stack);
      res.status(500).json({
        success: false,
        message: "Lỗi máy chủ.",
      });
    }
  }

  static async create(req, res) {
    try {
      const {
        name,
        description,
        discount_type,
        discount_value,
        quantity,
        start_date,
        end_date,
        status,
        applicable_to = 'all_products',
        min_price_threshold = 0,
        max_price = null,
        user_ids = [],
      } = req.body;

      if (!name) {
        return res.status(400).json({ success: false, message: 'Tên khuyến mãi không được để trống.' });
      }
      if (!applicable_to) {
        return res.status(400).json({ success: false, message: 'Trường applicable_to không được để trống.' });
      }
      if (discount_type === 'vnd' && Number(discount_value) >= Number(min_price_threshold)) {
        return res.status(400).json({
          success: false,
          message: 'Giá trị giảm (VNĐ) phải nhỏ hơn mức áp dụng đơn hàng từ.',
        });
      }
      const exists = await PromotionModel.findOne({ where: { name } });
      if (exists) {
        return res.status(409).json({ success: false, message: 'Tên khuyến mãi đã tồn tại.' });
      }
      if (new Date(start_date) > new Date(end_date)) {
        return res.status(400).json({ success: false, message: 'Ngày bắt đầu phải trước ngày kết thúc.' });
      }

      const now = new Date();
      const start = new Date(start_date);
      const end = new Date(end_date);
      end.setHours(23, 59, 59, 999);

      let promoStatus;
      if (status === 'inactive') {
        promoStatus = 'inactive';
      } else {
        promoStatus = now < start ? 'upcoming' : (now <= end ? 'active' : 'expired');
      }

      const code = await PromotionController.generateUniquePromoCode();
      const isSpecial = Array.isArray(user_ids) && user_ids.length > 0;
      const actualQuantity = isSpecial ? user_ids.length : Number(quantity);

      const promotion = await PromotionModel.create({
        name,
        description,
        discount_type,
        discount_value: Number(discount_value),
        quantity: actualQuantity,
        start_date: start,
        end_date: end,
        status: promoStatus,
        applicable_to,
        min_price_threshold: Number(min_price_threshold),
        max_price: max_price !== null ? Number(max_price) : null,
        code,
        special_promotion: isSpecial,
      });

      if (Array.isArray(user_ids) && user_ids.length > 0) {
        await promotion.setUsers(user_ids);
      }

      if (isSpecial) {
        await promotion.setUsers(user_ids);
      }

      res.status(201).json({ success: true, data: promotion });
    } catch (error) {
      console.error('Lỗi khi tạo khuyến mãi:', error);
      res.status(500).json({ success: false, message: 'Lỗi máy chủ' });
    }
  }

  static async generateUniquePromoCode(length = 8) {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code;

    let isUnique = false;
    while (!isUnique) {
      code = Array.from({ length }, () => characters[Math.floor(Math.random() * characters.length)]).join('');
      const existing = await PromotionModel.findOne({ where: { code } });
      if (!existing) {
        isUnique = true;
      }
    }

    return code;
  }


  static async getHighValueBuyers(req, res) {
    try {
      const now = new Date();
      const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

      const users = await UserModel.findAll({
        where: {
          status: 'active',
        },
        include: [{
          model: OrderModel,
          as: 'orders',
          where: {
            status: 'delivered',
            created_at: {
              [Op.between]: [startOfLastMonth, endOfLastMonth]
            }
          },
          required: false,
          attributes: ['total_price', 'created_at']
        }],
        attributes: ['id', 'name']
      });

      const enrichedUsers = users.map(user => {
        const orders = (user.orders || []).sort(
          (a, b) => new Date(b.created_at) - new Date(a.created_at)
        );
        const totalOrders = orders.length;

        const totalSpentInMonth = orders.reduce(
          (sum, order) => sum + parseFloat(order.total_price || 0),
          0
        );

        const ordersInfo = orders.map(order => ({
          created_at: new Date(order.created_at).toLocaleDateString('vi-VN'),
          total_price: parseFloat(order.total_price)
        }));

        const isHighValue = totalOrders > 8 && totalSpentInMonth > 5000000;

        return {
          id: user.id,
          name: user.name,
          total_orders: totalOrders,
          total_spent_in_month: totalSpentInMonth,
          is_high_value: isHighValue,
          orders_info: ordersInfo
        };
      });

      const sortedUsers = enrichedUsers.sort((a, b) => {
        if (a.is_high_value === b.is_high_value) {
          return b.total_orders - a.total_orders;
        }
        return b.is_high_value - a.is_high_value;
      });

      res.json({ success: true, data: sortedUsers });
    } catch (err) {
      console.error('Lỗi khi lấy danh sách người dùng:', err);
      res.status(500).json({ success: false, message: 'Lỗi máy chủ' });
    }
  }

  static async getById(req, res) {
    const { id } = req.params;
    try {
      const promotion = await PromotionModel.findByPk(id);
      if (!promotion) {
        return res.status(404).json({
          success: false,
          message: "Không tìm thấy khuyến mãi.",
        });
      }
      res.status(200).json({ success: true, data: promotion });
    } catch (error) {
      console.error("Lỗi khi lấy khuyến mãi theo ID:", error);
      res.status(500).json({ success: false, message: "Lỗi máy chủ." });
    }
  }

  static async update(req, res) {
    const { id } = req.params;

    try {
      const {
        name,
        description,
        discount_type,
        discount_value,
        quantity,
        start_date,
        end_date,
        status,
        applicable_to,
        min_price_threshold,
        max_price = null,
      } = req.body;

      const promotion = await PromotionModel.findByPk(id);
      if (!promotion) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy khuyến mãi.' });
      }
      const currentStatus = promotion.status;
      if (currentStatus === 'expired') {
        return res.status(403).json({ success: false, message: 'Khuyến mãi đã hết hạn, không thể sửa.' });
      }
      if (currentStatus === 'active') {
        const forbiddenFields = ['id', 'created_at', 'updated_at'];
        const keysToUpdate = Object.keys(req.body);
        const disallowedFields = keysToUpdate.filter(k => forbiddenFields.includes(k));
        if (disallowedFields.length > 0) {
          return res.status(403).json({ success: false, message: `Không được phép sửa trường: ${disallowedFields.join(', ')}` });
        }
      }
      if (start_date && end_date && new Date(start_date) > new Date(end_date)) {
        return res.status(400).json({ success: false, message: 'Ngày bắt đầu phải trước ngày kết thúc.' });
      }
      const now = new Date();
      const start = new Date(start_date);
      const end = new Date(end_date);
      end.setHours(23, 59, 59, 999);
      let promoStatus = (status === 'inactive')
        ? 'inactive'
        : (now < start ? 'upcoming' : (now <= end ? 'active' : 'expired'));
      await promotion.update({
        name,
        description,
        discount_type,
        discount_value: discount_value !== undefined ? Number(discount_value) : promotion.discount_value,
        quantity: quantity !== undefined ? Number(quantity) : promotion.quantity,
        start_date: start_date ? start : promotion.start_date,
        end_date: end_date ? end : promotion.end_date,
        status: promoStatus,
        applicable_to,
        min_price_threshold: min_price_threshold !== undefined ? Number(min_price_threshold) : promotion.min_price_threshold,
        max_price: max_price !== undefined ? Number(max_price) : promotion.max_price
      });
      res.status(200).json({ success: true, data: promotion });
    } catch (error) {
      console.error("Lỗi khi cập nhật khuyến mãi:", error);
      res.status(500).json({ success: false, message: "Lỗi máy chủ khi cập nhật khuyến mãi." });
    }
  }



  static async delete(req, res) {
    const { id } = req.params;
    try {
      const promotion = await PromotionModel.findByPk(id);
      if (!promotion) {
        return res.status(404).json({
          success: false,
          message: "Không tìm thấy khuyến mãi để xóa.",
        });
      }
      if (promotion.status !== "upcoming") {
        return res.status(400).json({
          success: false,
          message: "Chỉ có thể xóa khuyến mãi khi trạng thái là 'Sắp diễn ra'.",
        });
      }
      if (promotion.used_count > 0) {
        return res.status(400).json({
          success: false,
          message: "Không thể xóa vì khuyến mãi đã được áp dụng cho đơn hàng.",
        });
      }
      await promotion.destroy();
      return res.status(200).json({
        success: true,
        message: "Xóa khuyến mãi thành công.",
      });
    } catch (error) {
      console.error("Lỗi khi xóa khuyến mãi:", error);
      return res.status(500).json({
        success: false,
        message: "Lỗi máy chủ khi xóa khuyến mãi.",
      });
    }
  }

  static async getAppliedPromotions(req, res) {
    try {
      const promotions = await PromotionModel.findAll({
        include: [
          {
            model: OrderModel,
            as: 'orders',
            required: true,
            attributes: ['id', 'order_code', 'total_price', 'status', 'created_at'],
            include: [
              {
                model: UserModel,
                as: 'user',
                attributes: ['id', 'name', 'email'],
              }
            ]
          }
        ],
        order: [['updated_at', 'DESC']]
      });

      if (!promotions || promotions.length === 0) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy khuyến mãi đã áp dụng.' });
      }

      res.status(200).json({
        success: true,
        data: promotions,
      });
    } catch (error) {
      console.error('Lỗi khi lấy khuyến mãi đã áp dụng:', error);
      res.status(500).json({ success: false, message: 'Lỗi máy chủ.' });
    }
  }

  static async getOrdersByPromotion(req, res) {
    try {
      const promotionId = req.params.id;

      const promotion = await PromotionModel.findByPk(promotionId, {
        include: [
          {
            model: OrderModel,
            as: 'orders',
            required: true,
            attributes: [
              'id',
              'order_code',
              'status',
              'created_at',
              'payment_method',
              'shipping_address',
              'note',
              'total_price',
              'shipping_fee',
              'discount_amount',
              'special_discount_amount',
              'wallet_balance',
            ],
            include: [
              {
                model: UserModel,
                as: 'user',
                attributes: ['id', 'name', 'email', 'phone'],
              },
              {
                model: require('../../models/orderDetailsModel'),
                as: 'orderDetails',
                include: [
                  {
                    model: require('../../models/productVariantsModel'),
                    as: 'variant',
                    attributes: ['id', 'sku', 'price', 'stock'],
                    include: [
                      {
                        model: require('../../models/productsModel'),
                        as: 'product',
                        attributes: ['id', 'name'],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      });

      if (!promotion) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy khuyến mãi.' });
      }

      res.status(200).json({
        success: true,
        orders: promotion.orders,
      });
    } catch (error) {
      console.error('Lỗi khi lấy đơn hàng theo khuyến mãi:', error);
      res.status(500).json({ success: false, message: 'Lỗi máy chủ.' });
    }
  }

  static async getPromotionUsage(req, res) {
    try {
      const promotionId = req.query.promotionId ? Number(req.query.promotionId) : null;

      // whitelist trạng thái để build IN() an toàn
      const whitelist = new Set(['pending', 'confirmed', 'shipping', 'completed', 'delivered', 'cancelled']);
      const defaultStatuses = ['confirmed', 'shipping', 'completed', 'delivered'];
      const statuses = (req.query.statuses ? String(req.query.statuses).split(',') : defaultStatuses)
        .map(s => s.trim())
        .filter(s => whitelist.has(s));
      if (statuses.length === 0) statuses.push(...defaultStatuses);

      const from = req.query.from ? new Date(req.query.from) : null;
      const to = req.query.to ? new Date(req.query.to) : null;

      // helper format ‘YYYY-MM-DD HH:mm:ss’
      const fmt = (d) => d ? new Date(d).toISOString().replace('T', ' ').substring(0, 19) : null;

      const inStatuses = `(${statuses.map(s => `'${s}'`).join(',')})`;
      const fromClause = from ? `AND o.created_at >= '${fmt(from)}'` : '';
      const toClause = to ? `AND o.created_at <  '${fmt(to)}'` : '';

      // subqueries bằng literal — tham chiếu alias bảng promotions là "Promotion"
      const orderUsedLiteral = literal(`
        COALESCE((
          SELECT COUNT(*)
          FROM orders o
          WHERE o.promotion_id = Promotion.id
            AND o.status IN ${inStatuses}
            ${fromClause} ${toClause}
        ), 0)
      `);

      const specialUsedLiteral = literal(`
        COALESCE((
          SELECT COUNT(*)
          FROM orders o
          JOIN promotion_users pu ON pu.id = o.promotion_user_id
          WHERE pu.promotion_id = Promotion.id
            AND o.status IN ${inStatuses}
            ${fromClause} ${toClause}
        ), 0)
      `);

      const productQtyLiteral = literal(`
        COALESCE((
          SELECT SUM(od.promotion_applied_qty)
          FROM order_details od
          JOIN promotion_products pp ON pp.id = od.promotion_product_id
          JOIN orders o ON o.id = od.order_id
          WHERE pp.promotion_id = Promotion.id
            AND o.status IN ${inStatuses}
            ${fromClause} ${toClause}
        ), 0)
      `);

      const totalDiscountLiteral = literal(`
        COALESCE((
          SELECT SUM(COALESCE(o.discount_amount,0) + COALESCE(o.special_discount_amount,0))
          FROM orders o
          WHERE o.promotion_id = Promotion.id
            AND o.status IN ${inStatuses}
            ${fromClause} ${toClause}
        ), 0)
      `);

      const where = {};
      if (promotionId) where.id = promotionId;

      const rows = await PromotionModel.findAll({
        where,
        attributes: [
          'id',
          'name',
          'special_promotion',
          'applicable_to',
          [orderUsedLiteral, 'order_used_count'],
          [specialUsedLiteral, 'special_used_count'],
          [productQtyLiteral, 'product_used_qty'],
          [totalDiscountLiteral, 'total_discount_amount'],
        ],
        order: [['created_at', 'DESC']],
      });

      const data = rows.map(r => {
        const order_used_count = Number(r.get('order_used_count') || 0);
        const special_used_count = Number(r.get('special_used_count') || 0);
        const product_used_qty = Number(r.get('product_used_qty') || 0);
        const total_discount_amount = Number(r.get('total_discount_amount') || 0);
        return {
          promotion_id: r.id,
          name: r.name,
          special_promotion: !!r.special_promotion,
          applicable_to: r.applicable_to,
          order_used_count,
          special_used_count,
          product_used_qty,
          used_total_effective: order_used_count + special_used_count + product_used_qty,
          total_discount_amount,
        };
      });

      return res.status(200).json({
        success: true,
        filters: {
          promotionId: promotionId || null,
          statuses,
          from: from ? fmt(from) : null,
          to: to ? fmt(to) : null,
        },
        data,
      });
    } catch (error) {
      console.error('Lỗi khi lấy usage khuyến mãi:', error);
      return res.status(500).json({ success: false, message: 'Lỗi máy chủ.' });
    }
  }
}

module.exports = PromotionController;
