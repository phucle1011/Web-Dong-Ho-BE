const OrderModel = require('../../models/ordersModel');
const OrderDetailsModel = require('../../models/orderDetailsModel');
const ProductVariantsModel = require('../../models/productVariantsModel');
const ProductModel = require('../../models/productsModel');
const UserModel = require('../../models/usersModel');
const PromotionModel = require('../../models/promotionsModel');
const CommentModel = require('../../models/commentsModel');
const VariantImageModel = require('../../models/variantImagesModel');
const ProductVariantAttributeValueModel = require('../../models/productVariantAttributeValuesModel');
const WithdrawRequestsModel = require('../../models/withdrawRequestsModel');

const { Op } = require('sequelize');
const axios = require('axios');
const ExcelJS = require('exceljs');
const sequelize = require('../../config/database');

require("dotenv").config();
const nodemailer = require("nodemailer");

class OrderController {

    static async get(req, res) {
        const {
            searchTerm = '',
            page = 1,
            limit = 10,
            order_code,
            status,
            startDate,
            endDate
        } = req.query;

        const currentPage = parseInt(page, 10);
        const perPage = parseInt(limit, 10);
        const offset = (currentPage - 1) * perPage;

        try {
            const whereClause = {};

            if (searchTerm) {
                whereClause[Op.or] = [];
                if (searchTerm) {
                    whereClause[Op.or].push({
                        '$user.name$': { [Op.like]: `%${searchTerm}%` }
                    });
                }
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

            if (status && status !== 'all') {
                whereClause.status = status;
            }

            const updatedOrders = await OrderModel.findAll({
                where: whereClause,
                include: [{ model: UserModel, as: 'user' },
                    { model: OrderDetailsModel, as: 'orderDetails', attributes: ['auction_id'] }
                ],
                order: [['created_at', 'DESC']]
            });

            const allOrders = await OrderModel.findAll();

            const statusCounts = {
                all: allOrders.length,
                pending: 0,
                confirmed: 0,
                shipping: 0,
                completed: 0,
                delivered: 0,
                cancelled: 0
            };

            allOrders.forEach(order => {
                if (statusCounts.hasOwnProperty(order.status)) {
                    statusCounts[order.status]++;
                }
            });

            let filteredOrders = updatedOrders;
            if (status && status !== 'all') {
                const statusArray = typeof status === 'string' ? status.split(',') : [status];
                filteredOrders = updatedOrders.filter(order => statusArray.includes(order.status));
            }

            const totalFilteredItems = filteredOrders.length;

            const paginatedOrders = filteredOrders.slice(offset, offset + perPage);

            res.status(200).json({
                status: 200,
                message: "Lấy danh sách thành công",
                data: paginatedOrders,
                pagination: {
                    totalItems: totalFilteredItems,
                    currentPage,
                    totalPages: Math.ceil(totalFilteredItems / perPage),
                },
                statusCounts
            });

        } catch (error) {
            console.error("Lỗi khi lấy danh sách đơn hàng:", error.message, error.stack);
            res.status(500).json({
                success: false,
                message: "Lỗi máy chủ."
            });
        }
    }

    static async getById(req, res) {
        try {
            const { id } = req.params;
            const order = await OrderModel.findByPk(id, {
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
                                    },
                                    {
                                        model: VariantImageModel,
                                        as: 'images'
                                    },
                                    {
                                        model: ProductVariantAttributeValueModel,
                                        as: 'attributeValues'
                                    }
                                ]
                            },
                            {
                                model: CommentModel,
                                as: 'comments',
                                attributes: ['id', 'rating', 'comment_text', 'edited'],
                                required: false,
                            },
                        ]
                    },
                    {
                        model: UserModel,
                        as: 'user',
                        attributes: ['id', 'name', 'email', 'phone']
                    },
                    {
                        model: PromotionModel,
                        as: 'promotion',
                        attributes: ['name', 'code', 'min_price_threshold', 'max_price']
                    }
                ],
            });

            if (!order) {
                return res.status(404).json({ message: "Id không tồn tại" });
            }

            const orderData = order.toJSON();
            delete orderData.user_id;

            res.status(200).json({
                status: 200,
                message: "Lấy danh sách thành công",
                data: orderData,
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    static async update(req, res) {
        const t = await sequelize.transaction();
        try {
            const { id } = req.params;
            const {
                name,
                status,
                address,
                phone,
                email,
                total_price,
                payment_method_id,
                cancellation_reason
            } = req.body;

            const order = await OrderModel.findByPk(id, { transaction: t });
            if (!order) {
                await t.rollback();
                return res.status(404).json({ message: "Id không tồn tại" });
            }

            const oldStatus = order.status;

            if (status === "cancelled" && oldStatus !== "cancelled") {
                order.status = "cancelled";

                const user = await UserModel.findByPk(order.user_id, {
                    transaction: t,
                    lock: t.LOCK.UPDATE,
                });

                if (!user) {
                    await t.rollback();
                    return res.status(404).json({ message: "Không tìm thấy người dùng." });
                }

                const paymentMethod = order.payment_method?.toLowerCase();
                const walletBalance = Number(order.wallet_balance) || 0;

                let refundAmount = 0;

                if (paymentMethod === 'cod') {
                    if (walletBalance <= 0) {
                        await t.rollback();
                        return res.status(400).json({ message: "Đơn hàng COD không có phần thanh toán ví để hoàn tiền" });
                    }
                    refundAmount = walletBalance;
                } else {
                    refundAmount = Number(order.total_price || 0) + walletBalance;
                }

                const newBalance = Number(user.balance || 0) + refundAmount;
                console.log(`Hoàn tiền ${refundAmount} vào ví của người dùng ${user.id}. Số dư cũ: ${user.balance}, Số dư mới: ${newBalance}`);

                if (isNaN(newBalance)) {
                    await t.rollback();
                    return res.status(500).json({ message: "Lỗi tính toán số dư ví." });
                }

                user.balance = newBalance;
                await user.save({ transaction: t });

                await WithdrawRequestsModel.create({
                    user_id: user.id,
                    amount: refundAmount,
                    method: 'bank',
                    bank_account: '',
                    bank_name: '',
                    note: 'Hoàn tiền đơn hàng thanh toán',
                    status: 'approved',
                    type: 'refund',
                    order_id: order.id
                }, { transaction: t });

                if (order.promotion_id) {
                    const promotion = await PromotionModel.findByPk(order.promotion_id, { transaction: t });
                    if (promotion) {
                        if (promotion.special_promotion) {
                            await PromotionUserModel.update(
                                { used: false },
                                {
                                    where: {
                                        promotion_id: promotion.id,
                                        user_id: order.user_id,
                                    },
                                    transaction: t,
                                }
                            );
                        } else {
                            await promotion.increment('quantity', { by: 1, transaction: t });
                        }
                    }
                }

                await order.save({ transaction: t });
                await t.commit();

                try {
                    const user = await UserModel.findByPk(order.user_id);
                    if (user?.email) {
                        await OrderController.sendOrderCancellationEmail(order, user, user.email, cancellation_reason || "Hoàn tiền tự động vào ví");
                    }
                } catch (emailError) {
                    console.error("Lỗi gửi email hủy đơn hàng:", emailError);
                }

                return res.status(200).json({
                    status: 200,
                    message: `Đã hoàn tiền ${refundAmount.toLocaleString()} VNĐ vào ví và hủy đơn hàng.`,
                    refundedAmount: refundAmount,
                    orderStatus: order.status,
                    data: order,
                });
            }

            if (name !== undefined) order.name = name;
            if (status !== undefined) order.status = status;
            if (address !== undefined) order.address = address;
            if (phone !== undefined) order.phone = phone;
            if (email !== undefined) order.email = email;
            if (total_price !== undefined) order.total_price = total_price;
            if (payment_method_id !== undefined) order.payment_method_id = payment_method_id;

            await order.save({ transaction: t });
            await t.commit();

            return res.status(200).json({
                status: 200,
                message: "Cập nhật đơn hàng thành công.",
                data: order,
            });

        } catch (error) {
            await t.rollback();
            console.error("Lỗi cập nhật đơn hàng:", error);
            return res.status(500).json({ error: error.message });
        }
    }

    static async sendOrderCancellationEmail(order, user, customerEmail, cancellationReason) {
        try {
            let transporter = nodemailer.createTransport({
                service: "gmail",
                auth: {
                    user: process.env.EMAIL_USER,
                    pass: process.env.EMAIL_PASS,
                },
            });

            const formattedDate = new Date().toLocaleString("vi-VN", {
                timeZone: "Asia/Ho_Chi_Minh",
                hour12: false,
            });

            const formattedTotal = new Intl.NumberFormat("vi-VN").format(order.total_price);
            const formattedShipping = new Intl.NumberFormat("vi-VN").format(order.shipping_fee || 0);
            const formattedDiscount = new Intl.NumberFormat("vi-VN").format(order.discount_amount || 0);

            const htmlContent = `
            <!DOCTYPE html>
            <html lang="vi">
            <head>
                <meta charset="UTF-8" />
                <title>Hủy đơn hàng</title>
                <style>
                    body {
                        font-family: Arial, sans-serif;
                        background: #f5f5f5;
                        padding: 20px;
                        color: #333;
                    }
                    .container {
                        max-width: 500px;
                        margin: auto;
                        background: #fff;
                        padding: 20px;
                        border-radius: 8px;
                        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                    }
                    .title {
                        font-size: 18px;
                        font-weight: bold;
                        color: #d32f2f;
                        margin-bottom: 16px;
                    }
                    .info {
                        font-size: 14px;
                        margin-bottom: 12px;
                    }
                    .info span {
                        font-weight: bold;
                    }
                    .reason {
                        font-style: italic;
                        color: #555;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="title">Đơn hàng của bạn đã bị hủy</div>
    
                    <div class="info"><span>Mã đơn hàng:</span> #${order.order_code}</div>
                    <div class="info"><span>Khách hàng:</span> ${user?.name || "Không xác định"}</div>
                    <div class="info"><span>Email:</span> ${user?.email || customerEmail}</div>
                    <div class="info"><span>Ngày hủy:</span> ${formattedDate}</div>
                    <div class="info"><span>Tổng tiền:</span> ${formattedTotal}₫</div>
    
                    ${order.discount_amount > 0
                    ? `<div class="info"><span>Giảm giá:</span> -${formattedDiscount}₫</div>`
                    : ""
                }
    
                    ${order.shipping_fee > 0
                    ? `<div class="info"><span>Phí vận chuyển:</span> +${formattedShipping}₫</div>`
                    : ""
                }
    
                    <div class="info"><span>Lý do hủy:</span> <span class="reason">${cancellationReason || "Không có lý do cụ thể"}</span></div>
    
                    <p style="margin-top: 20px; font-size: 13px; color: #777;">
                        Nếu bạn có bất kỳ thắc mắc nào, vui lòng liên hệ lại với chúng tôi. Cảm ơn bạn đã sử dụng dịch vụ.
                    </p>

                ${["momo", "vnpay"].includes(order.payment_method?.toLowerCase?.())
                    ? `<p style="margin-top: 12px; font-size: 13px; color: #d32f2f;">
                                Vì đơn hàng được thanh toán bằng <strong>${order.payment_method.toUpperCase()}</strong>, vui lòng liên hệ với chúng tôi để được hoàn tiền qua:
                                <br />Email: <a href="mailto:phuclnhpc09097@gmail.com">phuclnhpc09097@gmail.com</a>
                                <br />Zalo: <a href="https://zalo.me/0379169731" target="_blank">0379169731</a>
                           </p>`
                    : ""
                }

                </div>
            </body>
            </html>
            `;

            const mailOptions = {
                from: `"Cửa hàng của bạn" <${process.env.EMAIL_USER}>`,
                to: customerEmail,
                subject: `Hủy đơn hàng #${order.order_code}`,
                html: htmlContent
            };

            await transporter.sendMail(mailOptions);
        } catch (error) {
            console.error("Lỗi gửi email hủy đơn hàng (chi tiết):", error);
            throw new Error("Không thể gửi email hủy đơn hàng.");
        }

    }

    static async delete(req, res) {
        const t = await sequelize.transaction();
        try {
            const { id } = req.params;

            const order = await OrderModel.findByPk(id, { transaction: t });
            if (!order) {
                await t.rollback();
                return res.status(404).json({ message: "Id không tồn tại" });
            }

            if (order.status !== "pending") {
                await t.rollback();
                return res.status(400).json({ message: "Chỉ được hủy đơn hàng có trạng thái là 'Chờ xác nhận'" });
            }

            const oldStatus = order.status;

            order.status = "cancelled";
            await order.save({ transaction: t });

            if (order.status === "cancelled" && oldStatus !== "cancelled" && order.promotion_id) {
                const promotion = await PromotionModel.findByPk(order.promotion_id, { transaction: t });

                if (promotion) {
                    if (promotion.special_promotion) {
                        await PromotionUserModel.update(
                            { used: false },
                            {
                                where: {
                                    promotion_id: promotion.id,
                                    user_id: order.user_id,
                                },
                                transaction: t,
                            }
                        );
                    } else {
                        await promotion.increment('quantity', { by: 1, transaction: t });
                    }
                }
            }

            await t.commit();
            res.status(200).json({
                status: 200,
                message: "Hủy đơn hàng thành công",
                data: order
            });
        } catch (error) {
            await t.rollback();
            res.status(500).json({ error: error.message });
        }
    }

    static async searchOrders(req, res) {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 10;
            const offset = (page - 1) * limit;

            const { status, searchTerm } = req.query;
            const where = {};

            if (status && status !== "all") {
                where.status = status;
            }

            const orders = await OrderModel.findAndCountAll({
                where,
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
                        include: [{
                            model: ProductVariantsModel,
                            as: 'variant',
                            attributes: ['price'],
                            include: [{ model: ProductModel, as: 'product', attributes: ['name'] }]
                        }]
                    }
                ],
                order: [['created_at', 'DESC']],
                limit,
                offset
            });

            if (searchTerm) {
                where[Op.or] = [
                    { '$user.name$': { [Op.like]: `%${searchTerm}%` } }
                ];
            }

            res.status(200).json({
                status: 200,
                message: 'Tìm kiếm thành công',
                data: orders.rows,
                totalPages: Math.ceil(orders.count / limit),
                currentPage: page
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    static async trackOrder(req, res) {
        try {
            const { orderCode } = req.params;

            const order = await OrderModel.findOne({ where: { order_code: orderCode } });

            if (!order) {
                return res.status(404).json({ message: 'Không tìm thấy đơn hàng trong hệ thống' });
            }

            if (!order.shipping_code) {
                return res.status(200).json({
                    status: 200,
                    message: 'Đơn hàng nội bộ - chưa gửi GHN',
                    data: {
                        order_code: order.order_code,
                        status: order.status,
                        updated_date: order.updated_at,
                        locations: [
                            {
                                time: order.updated_at,
                                location: 'Kho nội bộ',
                                note: 'Đơn hàng chưa gửi GHN',
                            }
                        ],
                        leadtime: null
                    }
                });
            }

            const response = await axios.post(
                'https://online-gateway.ghn.vn/shiip/public-api/v2/shipping-order/track',
                { order_code: order.shipping_code },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Token': '1f73c4c8-3184-11f0-b930-ca8d03ab5418',
                        'ShopId': '5778611'
                    },
                }
            );

            const trackingData = response.data.data;
            const history = trackingData.order_tracking || [];

            // Chuyển đổi dữ liệu để frontend dễ dùng: lấy thời gian, trạng thái, ghi chú (nếu có)
            const locations = history.map(item => ({
                time: item.time || item.updated_at,     // thời gian trạng thái (tùy API trả về)
                status: item.status_name || '',
                location: item.status_name || '',       // thường status_name chính là vị trí/trạng thái
                note: item.note || ''
            }));

            res.status(200).json({
                status: 200,
                message: 'Lấy lịch sử vị trí đơn hàng thành công',
                data: {
                    order_code: order.order_code,
                    status: order.status,
                    updated_date: order.updated_at,
                    locations,   // tất cả vị trí trạng thái đơn hàng
                    raw_tracking_data: trackingData
                }
            });

        } catch (error) {
            console.error('Lỗi theo dõi đơn hàng:', error?.response?.data || error.message);
            res.status(500).json({
                message: 'Không thể lấy thông tin đơn hàng',
                error: error?.response?.data || error.message,
            });
        }
    }

    static async exportExcel(req, res) {
        try {
            const { start_date, end_date } = req.query;
            const where = {};

            if (start_date && end_date) {
                const start = new Date(`${start_date}T00:00:00+07:00`);
                const end = new Date(`${end_date}T23:59:59+07:00`);

                where.created_at = {
                    [Op.between]: [start, end],
                };
            }

            const orders = await OrderModel.findAll({
                where,
                order: [['created_at', 'DESC']],
                include: [
                    {
                        model: OrderDetailsModel,
                        as: 'orderDetails',
                        attributes: ['quantity', 'price'],
                        include: [
                            {
                                model: ProductVariantsModel,
                                as: 'variant',
                                attributes: ['price'],
                                include: [
                                    {
                                        model: ProductModel,
                                        as: 'product',
                                        attributes: ['name'],
                                    },
                                ],
                            },
                        ],
                    },
                    {
                        model: UserModel,
                        as: 'user',
                        attributes: ['name', 'email', 'phone'],
                    },
                ],
            });

            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet('Đơn hàng');

            worksheet.columns = [
                { header: 'Mã đơn hàng', key: 'order_code', width: 20 },
                { header: 'Tên khách hàng', key: 'customer_name', width: 25 },
                { header: 'Số điện thoại', key: 'phone', width: 15 },
                { header: 'Ngày tạo', key: 'created_at', width: 20 },
                { header: 'Trạng thái', key: 'status', width: 15 },
                { header: 'Tổng tiền', key: 'total_price', width: 15 },
                { header: 'Sản phẩm', key: 'products', width: 40 },
            ];

            orders.forEach(order => {
                const products = order.orderDetails.map(detail => {
                    const name = detail.productVariant?.variantProduct?.name || '';
                    const quantity = detail.quantity;
                    return `${name} (x${quantity})`;
                }).join(', ');

                worksheet.addRow({
                    order_code: order.order_code,
                    customer_name: order.user?.name || '',
                    phone: order.user?.phone || '',
                    created_at: new Date(order.created_at).toLocaleString('vi-VN', {
                        timeZone: 'Asia/Ho_Chi_Minh',
                    }),
                    status: order.status,
                    total_price: order.total_price,
                    products,
                });
            });

            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', 'attachment; filename=orders.xlsx');

            await workbook.xlsx.write(res);
            res.end();
        } catch (error) {
            console.error('Lỗi xuất Excel:', error);
            res.status(500).json({ error: 'Xuất Excel thất bại' });
        }
    }

    static async filterByDate(req, res) {
        try {
            const { startDate, endDate } = req.query;

            if (!startDate || !endDate) {
                return res.status(400).json({ message: 'Thiếu ngày bắt đầu hoặc kết thúc.' });
            }

            const start = new Date(`${startDate}T00:00:00+07:00`);
            const end = new Date(`${endDate}T23:59:59+07:00`);

            if (isNaN(start) || isNaN(end)) {
                return res.status(400).json({ message: 'Ngày không hợp lệ.' });
            }

            const where = {
                created_at: {
                    [Op.between]: [start, end]
                }
            };

            const orders = await OrderModel.findAll({
                where,
                order: [['created_at', 'DESC']],
                include: [
                    {
                        model: OrderDetailsModel,
                        as: 'orderDetails',
                        attributes: ['quantity', 'price'],
                        include: [
                            {
                                model: ProductVariantsModel,
                                as: 'variant',
                                attributes: ['price'],
                                include: [
                                    {
                                        model: ProductModel,
                                        as: 'product',
                                        attributes: ['name']
                                    }
                                ]
                            }
                        ]
                    },
                    {
                        model: UserModel,
                        as: 'user',
                        attributes: ['id', 'name', 'email', 'phone']
                    }
                ]
            });

            const result = orders.map(order => {
                const orderData = order.toJSON();
                delete orderData.user_id;
                return orderData;
            });

            res.status(200).json({
                status: 200,
                message: 'Lọc đơn hàng theo ngày thành công',
                data: result
            });

        } catch (error) {
            console.error('Lỗi lọc đơn hàng theo ngày:', error);
            res.status(500).json({ message: 'Lỗi server', error: error.message });
        }
    }

}

module.exports = OrderController;