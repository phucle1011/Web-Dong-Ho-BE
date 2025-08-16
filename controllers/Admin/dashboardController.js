const Sequelize = require('sequelize');
const { Op, fn, col, literal } = require('sequelize');
const UserModel = require('../../models/usersModel');
const CommentModel = require('../../models/commentsModel');
const CategoryModel = require('../../models/categoriesModel');
const ProductModel = require('../../models/productsModel');
const OrderModel = require('../../models/ordersModel');
const PromotionModel = require('../../models/promotionsModel');
const OrderDetailModel = require('../../models/orderDetailsModel');
const ProductVariantModel = require('../../models/productVariantsModel');
const WithdrawRequestsModel = require('../../models/withdrawRequestsModel');

const FEE_NOTE = 'Phí quên thanh toán đơn hàng đấu giá';

async function sumFeeAllTime() {
  const row = await WithdrawRequestsModel.findOne({
    attributes: [[Sequelize.fn('SUM', Sequelize.col('amount')), 'fee']],
    where: {
      status: 'approved',
      note: { [Op.like]: `%${FEE_NOTE}%` },
    },
    raw: true,
  });
  return parseFloat(row?.fee || 0);
}

async function sumFeeByRange(startDate, endDate) {
  const row = await WithdrawRequestsModel.findOne({
    attributes: [[Sequelize.fn('SUM', Sequelize.col('amount')), 'fee']],
    where: {
      status: 'approved',
      note: { [Op.like]: `%${FEE_NOTE}%` },
      created_at: { [Op.between]: [startDate, endDate] },
    },
    raw: true,
  });
  return parseFloat(row?.fee || 0);
}

class DashboardController {
  static async getCounts(req, res) {
    try {
      const total_user = await UserModel.count();
      const total_comment = await CommentModel.count();
      const total_category = await CategoryModel.count();
      const total_product = await ProductModel.count();
      const total_order = await OrderModel.count();
      const total_promotion = await PromotionModel.count();

      const total_revenue_result = await OrderDetailModel.findOne({
        attributes: [
          [Sequelize.fn('SUM', Sequelize.literal('price * quantity')), 'totalRevenue']
        ],
        include: [
          {
            model: OrderModel,
            as: 'order',
            where: { status: 'completed' },
            attributes: [],
          },
        ],
        raw: true,
      });
      const orderRevenueTotal = parseFloat(total_revenue_result?.totalRevenue || 0);

      const now = new Date();

      const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const endOfCurrentMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

      const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

      const startOfCurrentYear = new Date(now.getFullYear(), 0, 1);
      const endOfCurrentYear = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);

      const startOfLastYear = new Date(now.getFullYear() - 1, 0, 1);
      const endOfLastYear = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999);

      async function getRevenueByDateRange(startDate, endDate) {
        const result = await OrderDetailModel.findOne({
          attributes: [[Sequelize.fn('SUM', Sequelize.literal('price * quantity')), 'revenue']],
          include: [{
            model: OrderModel,
            as: 'order',
            where: { status: 'completed', created_at: { [Op.between]: [startDate, endDate] } },
            attributes: [],
          }],
          raw: true,
        });
        return parseFloat(result?.revenue || 0);
      }

      const feeTotal = await sumFeeAllTime();
      const feeCurrentMonth = await sumFeeByRange(startOfCurrentMonth, endOfCurrentMonth);
      const feeLastMonth = await sumFeeByRange(startOfLastMonth, endOfLastMonth);
      const feeCurrentYear = await sumFeeByRange(startOfCurrentYear, endOfCurrentYear);
      const feeLastYear = await sumFeeByRange(startOfLastYear, endOfLastYear);

      const bestSellingVariant = await OrderDetailModel.findOne({
        attributes: [
          'product_variant_id',
          [Sequelize.fn('SUM', Sequelize.col('quantity')), 'totalSold']
        ],
        include: [
          {
            model: ProductVariantModel,
            as: 'variant',
            attributes: ['id', 'sku', 'price'],
            include: [
              {
                model: ProductModel,
                as: 'product',
                attributes: ['id', 'name'],
              }
            ]
          }
        ],
        group: ['product_variant_id', 'variant.id', 'variant->product.id'],
        order: [[Sequelize.literal('totalSold'), 'DESC']],
        raw: true,
        nest: true,
      });

      const revenueCurrentMonth = (await getRevenueByDateRange(startOfCurrentMonth, endOfCurrentMonth)) + feeCurrentMonth;
      const revenueLastMonth = (await getRevenueByDateRange(startOfLastMonth, endOfLastMonth)) + feeLastMonth;
      const revenueCurrentYear = (await getRevenueByDateRange(startOfCurrentYear, endOfCurrentYear)) + feeCurrentYear;
      const revenueLastYear = (await getRevenueByDateRange(startOfLastYear, endOfLastYear)) + feeLastYear;
      const total_revenue = orderRevenueTotal + feeTotal;

      return res.status(200).json({
        status: 200,
        message: "Lấy danh sách thành công",
        data: {
          total_user,
          total_comment,
          total_category,
          total_product,
          total_order,
          total_promotion,
          total_revenue,
          revenueCurrentMonth,
          revenueLastMonth,
          revenueCurrentYear,
          revenueLastYear,
          best_selling_product: bestSellingVariant || null,

        },
      });
    } catch (error) {
      console.error('Error in DashboardController.getCounts:', error);
      return res.status(500).json({ success: false, message: 'Lỗi server khi đếm dữ liệu' });
    }
  }

  static async getRevenueByMonthsInYear(req, res) {
    try {
      const { year } = req.query;
      if (!year) {
        return res.status(400).json({ status: 400, message: 'Thiếu tham số year' });
      }

      const yearNum = parseInt(year, 10);

      const revenueByMonth = Array(12).fill(0);

      const startDate = new Date(yearNum, 0, 1);
      const endDate = new Date(yearNum, 11, 31, 23, 59, 59, 999);

      const revenueResults = await OrderDetailModel.findAll({
        attributes: [
          [Sequelize.fn('MONTH', Sequelize.col('order.created_at')), 'month'],
          [Sequelize.fn('SUM', Sequelize.literal('price * quantity')), 'revenue'],
        ],
        include: [
          {
            model: OrderModel,
            as: 'order',
            where: {
              status: 'completed',
              created_at: { [Op.between]: [startDate, endDate] }
            },
            attributes: [],
          }
        ],
        group: ['month'],
        raw: true,
      });

      revenueResults.forEach(item => {
        const monthIndex = item.month - 1;
        revenueByMonth[monthIndex] = parseInt(item.revenue, 10) || 0;
      });

      return res.status(200).json({
        status: 200,
        message: 'Lấy doanh thu theo tháng thành công',
        data: {
          labels: Array.from({ length: 12 }, (_, i) => `Tháng ${i + 1}`),
          revenue: revenueByMonth,
        },
      });
    } catch (error) {
      console.error('Error in getRevenueByMonthsInYear:', error);
      return res.status(500).json({ status: 500, message: 'Lỗi server khi lấy doanh thu theo tháng' });
    }
  }

  static async getRevenueByDaysInMonth(req, res) {
    try {
      const { year, month } = req.query;
      if (!year || !month) {
        return res.status(400).json({ status: 400, message: 'Thiếu tham số year hoặc month' });
      }

      const yearNum = parseInt(year, 10);
      const monthNum = parseInt(month, 10) - 1;

      const daysInMonth = new Date(yearNum, monthNum + 1, 0).getDate();

      const revenueByDay = Array(daysInMonth).fill(0);

      const startDate = new Date(yearNum, monthNum, 1);
      const endDate = new Date(yearNum, monthNum, daysInMonth, 23, 59, 59, 999);

      const revenueResults = await OrderDetailModel.findAll({
        attributes: [
          [Sequelize.fn('DAY', Sequelize.col('order.created_at')), 'day'],
          [Sequelize.fn('SUM', Sequelize.literal('price * quantity')), 'revenue'],
        ],
        include: [
          {
            model: OrderModel,
            as: 'order',
            where: {
              status: 'completed',
              created_at: { [Op.between]: [startDate, endDate] }
            },
            attributes: [],
          }
        ],
        group: ['day'],
        raw: true,
      });

      revenueResults.forEach(item => {
        const dayIndex = item.day - 1;
        revenueByDay[dayIndex] = parseInt(item.revenue, 10) || 0;
      });

      return res.status(200).json({
        status: 200,
        message: 'Lấy doanh thu theo ngày thành công',
        data: {
          labels: Array.from({ length: daysInMonth }, (_, i) => `Ngày ${i + 1}`),
          revenue: revenueByDay,
        },
      });
    } catch (error) {
      console.error('Error in getRevenueByDaysInMonth:', error);
      return res.status(500).json({ status: 500, message: 'Lỗi server khi lấy doanh thu theo ngày' });
    }
  }

  static async getRevenueByCustomRange(req, res) {
    try {
      const { from, to } = req.query;
      if (!from || !to) {
        return res.status(400).json({ status: 400, message: 'Thiếu tham số from hoặc to' });
      }

      const startDate = new Date(from);
      const endDate = new Date(to);
      endDate.setHours(23, 59, 59, 999);

      const revenueResults = await OrderDetailModel.findAll({
        attributes: [
          [Sequelize.fn('DATE', Sequelize.col('order.created_at')), 'date'],
          [Sequelize.fn('SUM', Sequelize.literal('price * quantity')), 'revenue'],
        ],
        include: [
          {
            model: OrderModel,
            as: 'order',
            where: {
              status: 'completed',
              created_at: { [Op.between]: [startDate, endDate] }
            },
            attributes: [],
          }
        ],
        group: ['date'],
        order: [[Sequelize.literal('date'), 'ASC']],
        raw: true,
      });

      const feeResults = await WithdrawRequestsModel.findAll({
        attributes: [
          [Sequelize.fn('DATE', Sequelize.col('created_at')), 'date'],
          [Sequelize.fn('SUM', Sequelize.col('amount')), 'fee'],
        ],
        where: {
          status: 'approved',
          note: { [Op.like]: `%${FEE_NOTE}%` },
          created_at: { [Op.between]: [startDate, endDate] },
        },
        group: ['date'],
        raw: true,
      });

      const dateMap = {};
      revenueResults.forEach(r => { dateMap[r.date] = (parseFloat(r.revenue) || 0); });
      feeResults.forEach(f => {
        const day = f.date;
        const fee = parseFloat(f.fee || 0);
        dateMap[day] = (dateMap[day] || 0) + fee;
      });

      let cur = new Date(startDate);
      const items = [];
      while (cur <= endDate) {
        const dateStr = cur.toISOString().split('T')[0];
        items.push({ date: dateStr, revenue: dateMap[dateStr] || 0 });
        cur.setDate(cur.getDate() + 1);
      }

      const totalRevenue = items.reduce((s, it) => s + it.revenue, 0);

      return res.status(200).json({
        status: 200,
        message: 'Lấy doanh thu theo khoảng thời gian thành công',
        data: { items, totalRevenue },
      });
    } catch (error) {
      console.error('Error in getRevenueByCustomRange:', error);
      return res.status(500).json({ status: 500, message: 'Lỗi server khi lấy doanh thu theo khoảng thời gian' });
    }
  }

  static async getOrderStatusBreakdown(req, res) {
    try {
      const known = ['pending', 'confirmed', 'shipping', 'delivered', 'completed', 'cancelled'];

      const rows = await OrderModel.findAll({
        attributes: [
          'status',
          [Sequelize.fn('COUNT', Sequelize.literal('*')), 'count']
        ],
        group: ['status'],
        raw: true,
      });

      const map = Object.fromEntries(known.map(s => [s, 0]));
      rows.forEach(r => {
        if (r.status && map[r.status] !== undefined) {
          map[r.status] = Number(r.count) || 0;
        }
      });

      const totalRow = await OrderModel.findOne({
        attributes: [[Sequelize.fn('COUNT', Sequelize.literal('*')), 'total']],
        raw: true,

      });
      const totalAll = Number(totalRow?.total) || 0;
      const totalKnown = Object.values(map).reduce((a, b) => a + b, 0);
      const other = Math.max(0, totalAll - totalKnown);
      map.other = other;

      return res.status(200).json({ status: 200, data: map, totalAll });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ status: 500, message: 'Lỗi server breakdown trạng thái' });
    }
  }

  static async getPromotionImpact(req, res) {
    try {
      const { from, to } = req.query || {};

      const whereOrderBase = { status: "completed" };
      if (from && to) {
        const startDate = new Date(from);
        const endDate = new Date(to); endDate.setHours(23, 59, 59, 999);
        whereOrderBase.created_at = { [Op.between]: [startDate, endDate] };
      }

      const totalCompleted = await OrderModel.count({ where: whereOrderBase });

      const withPromoWhere = {
        ...whereOrderBase,
        promotion_id: { [Op.ne]: null }
      };

      const withoutPromoWhere = {
        ...whereOrderBase,
        [Op.or]: [{ promotion_id: null }, { promotion_id: { [Op.is]: null } }]
      };

      const promoOrderCount = await OrderModel.count({ where: withPromoWhere });
      const ordersWithoutPromo = await OrderModel.count({ where: withoutPromoWhere });

      const discountRow = await OrderModel.findOne({
        where: withPromoWhere,
        attributes: [
          [Sequelize.fn('SUM', Sequelize.fn('COALESCE', Sequelize.col('discount_amount'), 0)), 'discountSum'],
          [Sequelize.fn('SUM', Sequelize.fn('COALESCE', Sequelize.col('special_discount_amount'), 0)), 'specialDiscountSum'],
        ],
        raw: true
      });

      const totalDiscount =
        (Number(discountRow?.discountSum) || 0) +
        (Number(discountRow?.specialDiscountSum) || 0);

      const revenueWithPromoRow = await OrderDetailModel.findOne({
        attributes: [[Sequelize.fn('SUM', Sequelize.literal('price * quantity')), 'revenue']],
        include: [{ model: OrderModel, as: 'order', where: withPromoWhere, attributes: [] }],
        raw: true
      });

      const revenueWithoutPromoRow = await OrderDetailModel.findOne({
        attributes: [[Sequelize.fn('SUM', Sequelize.literal('price * quantity')), 'revenue']],
        include: [{ model: OrderModel, as: 'order', where: withoutPromoWhere, attributes: [] }],
        raw: true
      });

      const revenueWithPromoRaw = Number(revenueWithPromoRow?.revenue) || 0;
      const revenueWithoutPromo = Number(revenueWithoutPromoRow?.revenue) || 0;

      const revenueWithPromo = revenueWithPromoRaw - totalDiscount;

      const AOVWithPromo = promoOrderCount ? Math.round(revenueWithPromo / promoOrderCount) : 0;
      const AOVWithoutPromo = ordersWithoutPromo ? Math.round(revenueWithoutPromo / ordersWithoutPromo) : 0;

      const redemptionRate = totalCompleted ? (promoOrderCount / totalCompleted) * 100 : 0;

      return res.status(200).json({
        status: 200,
        data: {
          totals: {
            totalCompleted,
            promoOrderCount,
            ordersWithoutPromo,
            redemptionRate
          },
          revenue: {
            withPromo: revenueWithPromo,
            withoutPromo: revenueWithoutPromo,
            totalDiscount,
            AOVWithPromo,
            AOVWithoutPromo
          }
        }
      });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ status: 500, message: 'Lỗi server promo impact' });
    }
  }

  static async getTopPromotions(req, res) {
    try {
      const { from, to, limit = 5 } = req.query || {};
      const whereOrder = { status: 'completed', promotion_id: { [Op.ne]: null } };
      if (from && to) {
        const startDate = new Date(from);
        const endDate = new Date(to); endDate.setHours(23, 59, 59, 999);
        whereOrder.created_at = { [Op.between]: [startDate, endDate] };
      }

      const rows = await OrderModel.findAll({
        where: whereOrder,
        attributes: [

          [Sequelize.col('orders.promotion_id'), 'promotion_id'],
          [Sequelize.fn('COUNT', Sequelize.col('orders.id')), 'ordersCount'],
          [
            Sequelize.fn('SUM',
              Sequelize.fn('COALESCE', Sequelize.col('orders.discount_amount'), 0)
            ),
            'discountSum'
          ],
          [
            Sequelize.fn('SUM',
              Sequelize.fn('COALESCE', Sequelize.col('orders.special_discount_amount'), 0)
            ),
            'specialDiscountSum'
          ],
        ],
        include: [
          { model: PromotionModel, as: 'promotion', attributes: ['id', 'name', 'code'] }
        ],

        group: [Sequelize.col('orders.promotion_id'), Sequelize.col('promotion.id')],
        order: [[Sequelize.literal('ordersCount'), 'DESC']],
        limit: Number(limit),
        raw: true,
        nest: true
      });

      const data = rows.map(r => ({
        promotion_id: r.promotion_id,
        name: r.promotion?.name || `#${r.promotion_id}`,
        code: r.promotion?.code || '',
        ordersCount: Number(r.ordersCount) || 0,
        totalDiscount: (Number(r.discountSum) || 0) + (Number(r.specialDiscountSum) || 0),
      }));

      return res.status(200).json({ status: 200, data });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ status: 500, message: 'Lỗi server top promotions' });
    }
  }

  static async getTopBestSellers(req, res) {
    try {
      const limit = parseInt(req.query.limit) || 4;

      const bestSellers = await OrderDetailModel.findAll({
        attributes: [
          'product_variant_id',
          [fn('SUM', col('quantity')), 'totalSold']
        ],
        include: [
          {
            model: ProductVariantModel,
            as: 'variant',
            attributes: ['sku'],
            include: [
              {
                model: ProductModel,
                as: 'product',
                attributes: ['id', 'name', 'thumbnail']
              }
            ]
          }
        ],
        group: ['product_variant_id', 'variant.id', 'variant->product.id'],
        order: [[literal('totalSold'), 'DESC']],
        limit: limit  // dùng giá trị từ query
      });

      return res.status(200).json({
        status: 200,
        data: bestSellers
      });
    } catch (error) {
      console.error('Lỗi lấy top sản phẩm bán chạy:', error);
      return res.status(500).json({ status: 500, message: 'Lỗi server' });
    }
  }

}

module.exports = DashboardController;
