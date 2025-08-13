const UserModel = require('../../models/usersModel');
const WithdrawRequestsModel = require('../../models/withdrawRequestsModel');
const OrderDetailsModel = require('../../models/orderDetailsModel');
const ProductVariantsModel = require('../../models/productVariantsModel');
const ProductModel = require('../../models/productsModel');
const OrderModel = require('../../models/ordersModel');

const { Op } = require('sequelize');

require("dotenv").config();
const nodemailer = require("nodemailer");

class WalletsController {
  static async getAll(req, res) {
    const {
      searchTerm = '',
      page = 1,
      limit = 10,
      status,
      startDate,
      endDate,
      type
    } = req.query;

    const currentPage = parseInt(page, 10);
    const perPage = parseInt(limit, 10);
    const offset = (currentPage - 1) * perPage;

    try {
      const whereClause = {};

      if (type && type !== 'all') {
        whereClause.type = type;
      }

      if (status && status !== 'all') {
        whereClause.status = status;
      }

      if (startDate || endDate) {
        whereClause.created_at = {};
        if (startDate) {
          whereClause.created_at[Op.gte] = new Date(startDate);
        }
        if (endDate) {
          const endOfDay = new Date(endDate);
          endOfDay.setHours(23, 59, 59, 999);
          whereClause.created_at[Op.lte] = endOfDay;
        }
      }

      const allRequests = await WithdrawRequestsModel.findAll({
        attributes: ['status', 'type', 'user_id']
      });

      const statusCounts = {
        all: allRequests.length,
        pending: allRequests.filter(r => r.status === 'pending').length,
        approved: allRequests.filter(r => r.status === 'approved').length,
        rejected: allRequests.filter(r => r.status === 'rejected').length,
        recharge: allRequests.filter(r => r.type === 'recharge').length
      };

      const userRechargeCounts = {};
      allRequests.forEach(req => {
        if (req.type === 'recharge') {
          userRechargeCounts[req.user_id] = (userRechargeCounts[req.user_id] || 0) + 1;
        }
      });

      const requests = await WithdrawRequestsModel.findAll({
        where: whereClause,
        include: [
          {
            model: UserModel,
            as: 'user',
            where: searchTerm
              ? {
                [Op.or]: [
                  { name: { [Op.like]: `%${searchTerm}%` } },
                ]
              }
              : {},
            required: true
          },
          {
            model: OrderModel,
            as: 'order',
            include: [
              {
                model: UserModel,
                as: 'user',
                attributes: ['id', 'name', 'email', 'phone']
              },
              {
                model: OrderDetailsModel,
                as: 'orderDetails',
                attributes: ['quantity', 'price'],
                include: [
                  {
                    model: ProductVariantsModel,
                    as: 'variant',
                    attributes: ['sku'],
                    include: [
                      {
                        model: ProductModel,
                        as: 'product',
                        attributes: ['name']
                      }
                    ]
                  }
                ]
              }
            ]
          }
        ],
        order: [['created_at', 'DESC']]
      });

      const userMap = new Map();
      for (const r of requests) {
        const userId = r.user.id;

        if (!userMap.has(userId)) {
          userMap.set(userId, {
            id: r.id,
            user: r.user,
            amount: r.amount,
            status: r.status,
            type: r.type,
            method: r.method,
            bank_account: r.bank_account,
            note: r.note,
            order: r.order,
            created_at: r.created_at,
            updated_at: r.updated_at,
            latestCreatedAt: r.created_at,
            refundCount: 0,
            withdrawCount: 0,
            rechargeCount: userRechargeCounts[userId] || 0,
            hasPending: false
          });
        }

        const userData = userMap.get(userId);
        if (r.type === 'refund') userData.refundCount++;
        if (r.type === 'withdraw') userData.withdrawCount++;
        if (r.status === 'pending') userData.hasPending = true;

        if (new Date(r.created_at) > new Date(userData.latestCreatedAt)) {
          userData.latestCreatedAt = r.created_at;
        }
      }

      const allUsers = Array.from(userMap.values());
      const paginated = allUsers.slice(offset, offset + perPage);

      res.status(200).json({
        status: 200,
        message: "Lấy danh sách yêu cầu thành công",
        data: paginated.map(r => ({
          id: r.id,
          amount: r.amount,
          status: r.status,
          type: r.type,
          method: r.method,
          bank_account: r.bank_account,
          note: r.note,
          created_at: r.created_at,
          updated_at: r.updated_at,
          latestCreatedAt: r.latestCreatedAt,
          hasPending: r.hasPending,
          user: {
            id: r.user.id,
            name: r.user.name,
            email: r.user.email,
            balance: r.user.balance,
            created_at: r.user.created_at,
            refundCount: r.refundCount,
            withdrawCount: r.withdrawCount,
            rechargeCount: r.rechargeCount
          },
          order: r.order ? {
            id: r.order.id,
            total_price: r.order.total_price,
            payment_method: r.order.payment_method,
            shipping_address: r.order.shipping_address,
            created_at: r.order.created_at,
            shipping_fee: r.order.shipping_fee,
            discount_amount: r.order.discount_amount,
            special_discount_amount: r.order.special_discount_amount,
            user: r.order.user ? {
              name: r.order.user.name,
              phone: r.order.user.phone,
            } : null,
            orderDetails: r.order.orderDetails?.map(od => ({
              quantity: od.quantity,
              price: od.price,
              variant: {
                sku: od.variant?.sku,
                product: {
                  name: od.variant?.product?.name
                }
              }
            }))
          } : null
        })),
        pagination: {
          totalItems: allUsers.length,
          currentPage,
          totalPages: Math.ceil(allUsers.length / perPage),
        },
        statusCounts
      });

    } catch (error) {
      console.error("Lỗi khi lấy danh sách:", error.message, error.stack);
      res.status(500).json({
        success: false,
        message: "Lỗi máy chủ khi lấy danh sách"
      });
    }
  }

  static async getId(req, res) {
    const { id } = req.params;

    try {
      const request = await WithdrawRequestsModel.findOne({
        where: { id },
        include: [
          {
            model: UserModel,
            as: 'user',
            attributes: ['id', 'name', 'email', 'balance', 'created_at']
          },
          {
            model: OrderModel,
            as: 'order',
            include: [
              {
                model: UserModel,
                as: 'user',
                attributes: ['id', 'name', 'email', 'phone']
              },
              {
                model: OrderDetailsModel,
                as: 'orderDetails',
                attributes: ['quantity', 'price'],
                include: [
                  {
                    model: ProductVariantsModel,
                    as: 'variant',
                    attributes: ['sku'],
                    include: [
                      {
                        model: ProductModel,
                        as: 'product',
                        attributes: ['name']
                      }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      });

      if (!request) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy yêu cầu.' });
      }

      return res.json({ success: true, data: request });
    } catch (error) {
      console.error('Lỗi khi lấy chi tiết yêu cầu:', error);
      return res.status(500).json({ success: false, message: 'Lỗi server.' });
    }
  }

  static async getByUserId(req, res) {
    const { userId } = req.params;

    const { page = 1, limit = 10 } = req.query;

    const currentPage = parseInt(page, 10);
    const perPage = parseInt(limit, 10);
    const offset = (currentPage - 1) * perPage;

    try {
      const whereClause = { user_id: userId };

      const [withdraws, totalWithdraws] = await Promise.all([
        WithdrawRequestsModel.findAll({
          where: { ...whereClause, type: 'withdraw' },
          include: [
            { model: UserModel, as: 'user', attributes: ['id', 'name', 'email'] },
            {
              model: OrderModel,
              as: 'order',
              attributes: ['id', 'order_code', 'payment_method'],
              include: [
                {
                  model: OrderDetailsModel,
                  as: 'orderDetails',
                  include: [
                    {
                      model: ProductVariantsModel,
                      as: 'variant',
                      attributes: ['id', 'price', 'stock', 'sku'],
                      include: [
                        {
                          model: ProductModel,
                          as: 'product',
                          attributes: ['id', 'name']
                        }
                      ]
                    }
                  ]
                }
              ]
            }
          ],
          order: [['created_at', 'DESC']],
          offset,
          limit: perPage
        }),
        WithdrawRequestsModel.count({
          where: { ...whereClause, type: 'withdraw' }
        })
      ]);

      const [refunds, totalRefunds] = await Promise.all([
        WithdrawRequestsModel.findAll({
          where: { ...whereClause, type: 'refund' },
          include: [
            { model: UserModel, as: 'user', attributes: ['id', 'name', 'email'] },
            {
              model: OrderModel,
              as: 'order',
              attributes: ['id', 'order_code', 'payment_method'],
              include: [
                {
                  model: OrderDetailsModel,
                  as: 'orderDetails',
                  include: [
                    {
                      model: ProductVariantsModel,
                      as: 'variant',
                      attributes: ['id', 'price', 'stock', 'sku'],
                      include: [
                        {
                          model: ProductModel,
                          as: 'product',
                          attributes: ['id', 'name']
                        }
                      ]
                    }
                  ]
                }
              ]
            }
          ],
          order: [['created_at', 'DESC']],
          offset,
          limit: perPage
        }),
        WithdrawRequestsModel.count({
          where: { ...whereClause, type: 'refund' }
        })
      ]);

      const totalPages = Math.max(
        Math.ceil(totalWithdraws / perPage),
        Math.ceil(totalRefunds / perPage)
      );

      res.json({
        success: true,
        data: {
          withdraws,
          refunds
        },
        pagination: {
          totalWithdraws,
          totalRefunds,
          totalPages,
          currentPage
        }
      });
    } catch (error) {
      console.error('Lỗi phân trang từng loại:', error);
      res.status(500).json({
        success: false,
        message: "Lỗi máy chủ",
        error: error.message
      });
    }
  }

  static async updateWithdrawStatus(req, res) {
    const { id } = req.params;
    const { status, cancellation_reason } = req.body;

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Trạng thái không hợp lệ.' });
    }

    try {
      const request = await WithdrawRequestsModel.findByPk(id);
      if (!request) return res.status(404).json({ error: 'Yêu cầu không tồn tại.' });
      if (request.status !== 'pending') return res.status(400).json({ error: 'Chỉ xử lý yêu cầu đang chờ duyệt.' });

      const user = await UserModel.findByPk(request.user_id);
      if (!user) return res.status(404).json({ error: 'Người dùng không tồn tại.' });

      const amount = parseFloat(request.amount);
      const currentBalance = parseFloat(user.balance || 0);

      if (status === 'approved') {
        if (request.type === 'withdraw') {
          if (amount > currentBalance) {
            return res.status(400).json({ error: 'Số dư không đủ để thực hiện rút tiền.' });
          }
          user.balance = currentBalance - amount;
          await user.save();
        } else if (request.type === 'refund') {
          user.balance = currentBalance + amount;
          await user.save();

          if (request.order_id) {
            const order = await OrderModel.findByPk(request.order_id);
            if (order && order.status !== 'cancelled') {
              order.status = 'cancelled';
              await order.save();
            }
          }
        }

        await WalletsController.sendWithdrawApprovedEmail(user, amount, request.bank_name, request.bank_account);

        await request.update({ status: 'approved' });
      } else if (status === 'rejected') {
        if (!cancellation_reason || !String(cancellation_reason).trim()) {
          return res.status(400).json({ error: 'Vui lòng chọn/lý do từ chối.' });
        }
        await request.update({ status: 'rejected', cancellation_reason });
        await WalletsController.sendWithdrawRejectedEmail(user, amount, request.bank_name, request.bank_account, cancellation_reason);
      }

      return res.json({ message: status === 'approved' ? 'Đã duyệt yêu cầu rút tiền.' : 'Đã từ chối yêu cầu rút tiền.' });
    } catch (err) {
      console.error("Lỗi xử lý yêu cầu:", err);
      return res.status(500).json({ error: 'Đã xảy ra lỗi.' });
    }
  }

  static async sendWithdrawApprovedEmail(user, amount, bankName, bankAccount) {
    try {
      const formattedAmount = new Intl.NumberFormat('vi-VN').format(amount);
      const formattedBalance = new Intl.NumberFormat('vi-VN').format(user.balance);

      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS,
        },
      });

      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: user.email,
        subject: "Rút tiền thành công",
        html: `
        <p>Chào ${user.full_name || user.name || "bạn"},</p>
        <p>Yêu cầu rút tiền <strong>${formattedAmount}₫</strong> của bạn đã được duyệt thành công.</p>
        <p><strong>Ngân hàng:</strong> ${bankName.toUpperCase()}</p>
        <p><strong>Số tài khoản:</strong> ${bankAccount}</p>
        <p><strong>Số dư còn lại:</strong> ${formattedBalance}₫</p>
         <hr />
        <p style="color:#444;"><em>Nếu có bất kỳ sai sót nào, vui lòng liên hệ chúng tôi để được hỗ trợ xử lý kịp thời:</em></p>
        <ul>
          <li>Điện thoại / Zalo: <strong>0379 169 731</strong></li>
          <li>Email: <strong>phuc628780@gmail.com</strong></li>
        </ul>
        <p>-- Hệ thống Đồng Hồ TimesMaster --</p>
      `,
      };

      await transporter.sendMail(mailOptions);

    } catch (err) {
      console.error("Gửi mail thất bại:", err);
    }
  }

  static async sendWithdrawRejectedEmail(user, amount, bankName, bankAccount, cancellation_reason) {
    try {
      const formattedAmount = new Intl.NumberFormat('vi-VN').format(amount);

      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS,
        },
      });

      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: user.email,
        subject: "Yêu cầu rút tiền bị từ chối",
        html: `
        <p>Chào ${user.name || "bạn"},</p>
        <p>Yêu cầu rút tiền <strong>${formattedAmount}₫</strong> của bạn đã bị <span style="color:red;"><strong>TỪ CHỐI</strong></span>.</p>
        <p><strong>Ngân hàng:</strong> ${bankName.toUpperCase()}</p>
        <p><strong>Số tài khoản:</strong> ${bankAccount}</p>
        <p><strong>Lý do:</strong> ${cancellation_reason}</p>
        <p>Vui lòng kiểm tra lại thông tin hoặc liên hệ với chúng tôi nếu cần hỗ trợ.</p>
        <hr />
        <p style="color:#444;"><em>Nếu có bất kỳ sai sót nào, vui lòng liên hệ chúng tôi để được hỗ trợ xử lý kịp thời:</em></p>
        <ul>
          <li>Điện thoại / Zalo: <strong>0379 169 731</strong></li>
          <li>Email: <strong>phuc628780@gmail.com</strong></li>
        </ul>
        <p>-- Hệ thống Đồng Hồ TimesMaster --</p>
      `
      };

      await transporter.sendMail(mailOptions);
    } catch (err) {
      console.error("Gửi mail từ chối thất bại:", err);
    }
  }

  static async getTopupHistory(req, res) {
    const { userId } = req.query;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const offset = (page - 1) * limit;

    try {
      const topups = await WithdrawRequestsModel.findAll({
        where: {
          user_id: userId,
          note: 'Nạp tiền từ Stripe',
          type: 'recharge'
        },
        order: [['created_at', 'DESC']],
        limit,
        offset
      });

      const totalTopups = await WithdrawRequestsModel.count({
        where: {
          user_id: userId,
          note: 'Nạp tiền từ Stripe',
          type: 'recharge'
        }
      });

      return res.status(200).json({
        success: true,
        message: 'Lịch sử nạp tiền Stripe',
        data: topups,
        pagination: {
          total: totalTopups,
          page,
          totalPages: Math.ceil(totalTopups / limit)
        }
      });
    } catch (error) {
      console.error("Lỗi lấy lịch sử nạp tiền:", error);
      return res.status(500).json({
        success: false,
        message: 'Lỗi máy chủ',
        error: error.message
      });
    }
  }

}

module.exports = WalletsController;
