const axios = require("axios");
const OrderModel = require("../../models/ordersModel");
const OrderDetail = require("../../models/orderDetailsModel");
const UserModel = require("../../models/usersModel");
const CartModel = require("../../models/cartDetailsModel");
const PromotionModel = require("../../models/promotionsModel");
const ProductVariantModel = require("../../models/productVariantsModel");
const PromotionUserModel = require("../../models/promotionUsersModel");
const WithdrawRequestsModel = require('../../models/withdrawRequestsModel');
const RedisService = require("../../config/redisService");
const PromotionProductModel = require("../../models/promotionProductsModel");

const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

const requestIp = require("request-ip");
const moment = require("moment");
const { Op } = require("sequelize");
const sequelize = require("../../config/database");

require("dotenv").config();
const nodemailer = require("nodemailer");

const { BACKEND_URL } = require("../../config/url");
const { FRONTEND_URL } = require("../../config/url");

const crypto = require("crypto");
const { lookup } = require("dns");
const { log } = require("console");

class OrderController {
    static async get(req, res) {
        const userId = req.user.id;

        const { page = 1, limit = 10, status, startDate, endDate } = req.query;

        const currentPage = parseInt(page, 10);
        const perPage = parseInt(limit, 10);
        const offset = (currentPage - 1) * perPage;

        try {
            const whereClause = {
                user_id: userId,
            };

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

            if (status && status !== "all") {
                whereClause.status = status;
            }

            const { count, rows } = await OrderModel.findAndCountAll({
                where: whereClause,
                include: [{ model: UserModel, as: "user" }],
                order: [["created_at", "DESC"]],
                offset,
                limit: perPage,
            });

            const filteredOrders = await OrderModel.findAll({
                where: whereClause,
                include: [{ model: UserModel, as: "user" }],
                order: [["created_at", "DESC"]],
            });

            const statusCounts = {
                all: filteredOrders.length,
                pending: 0,
                confirmed: 0,
                shipping: 0,
                completed: 0,
                delivered: 0,
                cancelled: 0,
            };

            filteredOrders.forEach((order) => {
                if (statusCounts.hasOwnProperty(order.status)) {
                    statusCounts[order.status]++;
                }
            });

            res.status(200).json({
                status: 200,
                message: "Lấy danh sách thành công",
                data: rows,
                pagination: {
                    totalItems: count,
                    currentPage,
                    totalPages: Math.ceil(count / perPage),
                },
                statusCounts,
            });
        } catch (error) {
            console.error(
                "Lỗi khi lấy danh sách đơn hàng:",
                error.message,
                error.stack
            );
            res.status(500).json({
                success: false,
                message: "Lỗi máy chủ.",
            });
        }
    }

    static async update(req, res) {
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
            } = req.body;

            const order = await OrderModel.findByPk(id);
            if (!order) {
                return res.status(404).json({ message: "Id không tồn tại" });
            }

            const previousStatus = order.status;

            if (name !== undefined) order.name = name;
            if (status !== undefined) order.status = status;
            if (address !== undefined) order.address = address;
            if (phone !== undefined) order.phone = phone;
            if (email !== undefined) order.email = email;
            if (total_price !== undefined) order.total_price = total_price;
            if (payment_method_id !== undefined)
                order.payment_method_id = payment_method_id;

            await order.save();

            if (previousStatus !== "cancelled" && status === "cancelled") {
                const user = await UserModel.findByPk(order.user_id);
                if (user && user.email) {
                    await this.sendOrderCancellationEmail(
                        order,
                        user,
                        user.email,
                        cancellation_reason
                    );
                }
            }

            res.status(200).json({
                status: 200,
                message: "Cập nhật thành công",
                data: order,
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

static async cancelOrder(req, res) {
        const t = await sequelize.transaction();
        try {
            const { id } = req.params;
            const { cancellation_reason } = req.body;

            const order = await OrderModel.findByPk(id);

            if (!order) {
                return res.status(404).json({ message: "Id không tồn tại" });
            }

            const orderDetails = await OrderDetail.findAll({
                where: { order_id: order.id },
                transaction: t,
            });

            for (const detail of orderDetails) {
                const productVariant = await ProductVariantModel.findByPk(
                    detail.product_variant_id,
                    {
                        transaction: t,
                        lock: t.LOCK.UPDATE,
                    }
                );

                if (productVariant) {
                    productVariant.stock += detail.quantity;
                    await productVariant.save({ transaction: t });
                }
            }

            const promo = await PromotionModel.findByPk(order.promotion_id);
            if (promo) {
                await promo.increment("quantity", { transaction: t });

                if (promo.special_promotion) {
                    await PromotionUser.update(
                        { used: false },
                        {
                            where: {
                                promotion_id: promo.id,
                                user_id: order.user_id,
                            },
                            transaction: t,
                        }
                    );
                }
            }
const promoDetails = await OrderDetail.findAll({
  where: {
    order_id: order.id,
    promotion_product_id: { [Op.ne]: null },
    promotion_applied_qty: { [Op.gt]: 0 },
  },
  include: [
    {
      model: PromotionProductModel,
      as: "promotionProduct",          // chỉnh alias cho đúng dự án bạn
      attributes: ["id", "promotion_id"],
      include: [
        {
          model: PromotionModel,
          as: "promotion",             // alias đúng với association
          attributes: ["id", "special_promotion"],
        },
      ],
    },
  ],
  transaction: t,
  lock: t.LOCK.UPDATE,
});

// 2) Gom tổng
const promoTotals = new Map();     // promotion_id -> total qty
const productTotals = new Map();   // promotion_product_id -> total qty
const involvedPromotionIds = new Set();

for (const d of promoDetails) {
  const qty = Number(d.promotion_applied_qty || 0);
  const pp = d.promotionProduct;
  if (!pp || !qty) continue;

  const promoId = pp.promotion_id || pp.promotion?.id;
  if (!promoId) continue;

  involvedPromotionIds.add(promoId);
  promoTotals.set(promoId, (promoTotals.get(promoId) || 0) + qty);
  productTotals.set(pp.id, (productTotals.get(pp.id) || 0) + qty);
}
// 3) Hoàn về Promotion.quantity, có bù trừ nếu trùng promo.id đã +1 ở block cũ
for (const [promotion_id, totalQty] of promoTotals) {
  const adjust = (promo && promotion_id === promo.id)
    ? Math.max(totalQty - 1, 0)   // đã +1 ở block cũ → chỉ cộng thêm (tổng-1)
    : totalQty;

  if (adjust > 0) {
    await PromotionModel.increment("quantity", {
      by: adjust,
      where: { id: promotion_id },
      transaction: t,
    });
  }
}

// 4) Hoàn về PromotionProduct.variant_quantity theo từng dòng
for (const [promotion_product_id, byQty] of productTotals) {
  await PromotionProductModel.increment("variant_quantity", {
    by: byQty,
    where: { id: promotion_product_id },
    transaction: t,
  });
}

// 5) Mở lại PromotionUser.used=false cho các promotion khác (promo.id đã mở ở block cũ)

            order.status = "cancelled";
            order.cancellation_reason = cancellation_reason || null;
            await order.save({ transaction: t });

            const user = await UserModel.findByPk(order.user_id);

            const isOnlinePayment = ["vnpay", "momo"].includes(
                order.payment_method?.toLowerCase()
            );
            if (!isOnlinePayment) {
                await OrderController.sendOrderCancellationEmail(
                    order,
                    user,
                    user?.email || "no-reply@example.com",
                    cancellation_reason
                );
            }

            await t.commit();

            res.status(200).json({
                status: 200,
                message: 'Hủy đơn hàng thành công',
                data: order,
                isOnlinePayment
            });
        } catch (error) {
            await t.rollback();
            res.status(500).json({ error: error.message });
        }
    }

    static async requestRefund(req, res) {
        const t = await sequelize.transaction();
        try {
            const { orderId } = req.body;
            const userId = req.user.id;

            if (!orderId) {
                return res.status(400).json({
                    success: false,
                    message: "Thiếu thông tin đơn hàng để hoàn tiền"
                });
            }

            const order = await OrderModel.findOne({
                where: { id: orderId, user_id: userId },
                transaction: t,
                lock: t.LOCK.UPDATE,
            });

            if (!order) {
                await t.rollback();
                return res.status(404).json({ message: "Không tìm thấy đơn hàng" });
            }

            const paymentMethod = order.payment_method?.toLowerCase();
            const walletBalance = Number(order.wallet_balance) || 0;
            const totalPrice = Number(order.total_price) || 0;

            if (order.status !== 'pending') {
                await t.rollback();
                return res.status(400).json({ message: `Chỉ có thể hoàn tiền cho đơn hàng đang 'Chờ xác nhận'` });
            }

            const existingRefund = await WithdrawRequestsModel.findOne({
                where: {
                    user_id: userId,
                    type: 'refund',
                    status: { [Op.in]: ['pending', 'approved'] },
                    order_id: orderId
                },
                transaction: t,
            });

            if (existingRefund) {
                await t.rollback();
                return res.status(400).json({
                    success: false,
                    message: "Đơn hàng này đã được hoàn tiền hoặc đang chờ xử lý."
                });
            }

            let refundAmount = 0;

            if (paymentMethod === 'cod') {
                if (walletBalance <= 0) {
                    await t.rollback();
                    return res.status(400).json({ message: "Đơn hàng COD không có phần thanh toán ví để hoàn tiền" });
                }
                refundAmount = walletBalance;
            } else if (paymentMethod === 'momo' || paymentMethod === 'vnpay') {
                refundAmount = walletBalance + totalPrice;
            } else {
                await t.rollback();
                return res.status(400).json({ message: `Phương thức thanh toán '${paymentMethod}' không hỗ trợ hoàn tiền` });
            }

            const user = await UserModel.findByPk(userId, {
                transaction: t,
                lock: t.LOCK.UPDATE,
            });

            if (!user) {
                await t.rollback();
                return res.status(404).json({ message: "Không tìm thấy người dùng." });
            }

            user.balance = parseFloat(user.balance || 0) + refundAmount;
            await user.save({ transaction: t });

            await WithdrawRequestsModel.create({
                user_id: userId,
                amount: refundAmount,
                method: 'bank',
                bank_account: '',
                bank_name: '',
                note: 'Hoàn tiền đơn hàng thanh toán online',
                status: 'approved',
                type: 'refund',
                order_id: order.id
            }, { transaction: t });

            order.status = 'cancelled';
            await order.save({ transaction: t });

            try {
                await OrderController.sendOrderCancellationEmail(
                    order,
                    user,
                    user.email || "no-reply@example.com",
                    "Hoàn tiền tự động vào ví"
                );
            } catch (emailError) {
                console.warn("Không gửi được email:", emailError);
            }

            await t.commit();

            return res.status(200).json({
                success: true,
                message: `Đã hoàn tiền ${refundAmount.toLocaleString()} VNĐ vào ví và hủy đơn hàng.`,
                refundedAmount: refundAmount,
                orderStatus: order.status,
            });

        } catch (err) {
            await t.rollback();
            console.error("Lỗi khi hoàn tiền:", err);
            res.status(500).json({
                success: false,
                message: "Lỗi máy chủ khi hoàn tiền"
            });
        }
    }

    static async sendOrderCancellationEmail(
        order,
        user,
        customerEmail,
        cancellationReason
    ) {
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

            const formattedTotal = new Intl.NumberFormat("vi-VN").format(
                order.total_price
            );
            const formattedShipping = new Intl.NumberFormat("vi-VN").format(
                order.shipping_fee || 0
            );
            const formattedDiscount = new Intl.NumberFormat("vi-VN").format(
                order.discount_amount || 0
            );

            const isOnlinePayment = ["vnpay", "momo"].includes(
                order.payment_method?.toLowerCase()
            );

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
            .refund-info {
                background: #fff8e1;
                padding: 12px;
                border-radius: 4px;
                margin: 16px 0;
                border-left: 4px solid #ffc107;
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

            ${isOnlinePayment
                    ? `<div class="refund-info">
                  <p><strong>Thông tin hoàn tiền:</strong></p>
                  <p>Đơn hàng này đã được thanh toán qua <strong>${order.payment_method.toUpperCase()}</strong>.</p>
                  <p>Số tiền ${formattedTotal}₫ sẽ được hoàn trả vào tài khoản của bạn trễ nhất trong vòng 3-5 ngày tới.</p>
                  <p>Nếu bạn có bất kỳ thắc mắc nào, vui lòng liên hệ với chúng tôi qua:</p>
                  <ul>
                    <li>Email: <a href="mailto:phuclnhpc09097@gmail.com">phuclnhpc09097@gmail.com</a></li>
                    <li>Zalo: <a href="https://zalo.me/0379169731" target="_blank">0379169731</a></li>
                  </ul>
                </div>`
                    : ""
                }

            <p style="margin-top: 20px; font-size: 13px; color: #777;">
                Nếu bạn có bất kỳ thắc mắc nào, vui lòng liên hệ lại với chúng tôi. Cảm ơn bạn đã sử dụng dịch vụ.
            </p>
        </div>
    </body>
    </html>
    `;

            const mailOptions = {
                from: `"Cửa hàng của bạn" <${process.env.EMAIL_USER}>`,
                to: customerEmail,
                subject: `Hủy đơn hàng #${order.order_code}`,
                html: htmlContent,
            };

            await transporter.sendMail(mailOptions);
        } catch (error) {
            console.error("Lỗi gửi email hủy đơn hàng (chi tiết):", error);
            throw new Error("Không thể gửi email hủy đơn hàng.");
        }
    }

    static async confirmDelivered(req, res) {
        try {
            const { id } = req.params;

            const order = await OrderModel.findByPk(id);
            if (!order) {
                return res.status(404).json({ message: "Không tìm thấy đơn hàng" });
            }

            if (order.status !== "delivered") {
                return res.status(400).json({
                    message:
                        "Chỉ được xác nhận giao hàng cho đơn hàng có trạng thái 'Đã giao hàng thành công'",
                });
            }

            order.status = "completed";
            await order.save();

            res.status(200).json({
                status: 200,
                message: "Xác nhận giao hàng thành công",
                data: order,
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    static async create(req, res) {
        const {
            products,
            user_id,
            name,
            phone,
            email,
            address,
            payment_method,
            promotion,
            note,
            shipping_fee,
            promo_discount,
            voucher_discount,
            promotion_user_id,
            wallet_balance,
        } = req.body;

        if (!products || products.length === 0) {
            return res.status(400).json({ message: "Giỏ hàng trống." });
        }

        if (!user_id) {
            return res.status(400).json({ message: "Thiếu user_id trong yêu cầu." });
        }

        const t = await sequelize.transaction();
        try {
            let totalPrice = 0;
            const detailedCart = [];

            for (const item of products) {
                const variant = item.variant;
                const promotion_product_id = item.promotion_product_id;
                let promotionAppliedQty = 0;
                let promotionProductIdToSave = null; 
                if (!variant) {
                    await t.rollback();
                    return res.status(400).json({ message: "Thiếu thông tin biến thể sản phẩm." });
                }

                const productVariant = await ProductVariantModel.findByPk(variant.id, {
                    transaction: t,
                    lock: t.LOCK.UPDATE,
                });

                if (!productVariant) {
                    await t.rollback();
                    return res.status(400).json({ message: `Không tìm thấy biến thể ID ${variant.id}.` });
                }

                if (productVariant.stock < item.quantity) {
                    await t.rollback();
                    return res.status(400).json({ message: `Sản phẩm ${variant.sku} không đủ kho.` });
                }


if (promotion_product_id) { 
  const promoProd = await PromotionProductModel.findOne({
    where: {
      promotion_id: promotion_product_id,        
      product_variant_id: variant.id,
    },
    transaction: t,
    lock: t.LOCK.UPDATE,
  });

  if (promoProd && promoProd.variant_quantity > 0) {
    promotionAppliedQty = Math.min(promoProd.variant_quantity, item.quantity);

    await promoProd.update(
      { variant_quantity: promoProd.variant_quantity - promotionAppliedQty },
      { transaction: t }
    );

    await PromotionModel.decrement(
      { quantity: promotionAppliedQty },
      {
        where: { id: promoProd.promotion_id },     
        transaction: t,
      }
    );

    promotionProductIdToSave = promoProd.id;       
  }
}

const price = parseFloat(variant.price);
totalPrice += price * item.quantity;

detailedCart.push({
  variant: variant.id,
  name: variant.sku,
  price,
  quantity: item.quantity,
  total: price * item.quantity,
  auction_id: item.auction_id || null,
  promotion_product_id: promotionProductIdToSave,  
  promotion_applied_qty: promotionAppliedQty || 0, 
});

productVariant.stock -= item.quantity;
await productVariant.save({ transaction: t });

            }

            let promoUser = null;
            let specialDiscount = parseFloat(promo_discount) || 0;
            let voucherDiscount = parseFloat(voucher_discount) || 0;

            if (promotion) {
                const normalPromotion = await PromotionModel.findByPk(promotion, {
                    transaction: t,
                    lock: t.LOCK.UPDATE,
                });

                if (
                    normalPromotion &&
                    !normalPromotion.special_promotion
                ) {
                    const now = new Date();
                    if (
                        normalPromotion.status !== "active" ||
                        now < normalPromotion.start_date ||
                        now > normalPromotion.end_date ||
                        normalPromotion.quantity <= 0 ||
                        totalPrice < normalPromotion.min_price_threshold
                    ) {
                        await t.rollback();
                        return res.status(400).json({ message: "Mã khuyến mãi thường không hợp lệ." });
                    }

                    normalPromotion.quantity = Math.max(0, normalPromotion.quantity - 1);
                    await normalPromotion.save({ transaction: t });
                }
            }

            if (promotion_user_id) {
                promoUser = await PromotionUserModel.findOne({
                    where: {
                        id: parseInt(promotion_user_id),
                        user_id,
                        email_sent: true,
                        used: false,
                    },
                    include: [
                        {
                            model: PromotionModel,
                            as: "promotion",
                            required: true,
                        },
                    ],
                    transaction: t,
                    lock: t.LOCK.UPDATE,
                });

                if (!promoUser || !promoUser.promotion) {
                    await t.rollback();
                    return res.status(403).json({ message: "Mã đặc biệt không hợp lệ hoặc đã sử dụng." });
                }

                const specialPromotion = promoUser.promotion;
                const now = new Date();
                if (
                    specialPromotion.status !== "active" ||
                    now < specialPromotion.start_date ||
                    now > specialPromotion.end_date ||
                    specialPromotion.quantity <= 0 ||
                    totalPrice < specialPromotion.min_price_threshold
                ) {
                    await t.rollback();
                    return res.status(400).json({ message: "Mã đặc biệt không hợp lệ hoặc không đủ điều kiện." });
                }

                promoUser.used = true;
                await promoUser.save({ transaction: t });

                specialPromotion.quantity = Math.max(0, specialPromotion.quantity - 1);
                await specialPromotion.save({ transaction: t });

            }

            if (specialDiscount > 0) {
                specialDiscount = Math.min(specialDiscount, totalPrice);
                totalPrice -= specialDiscount;
            }

            if (voucherDiscount > 0) {
                voucherDiscount = Math.min(voucherDiscount, totalPrice);
                totalPrice -= voucherDiscount;
            }

            const usedFromWallet = Number(wallet_balance || 0);
            if (usedFromWallet > 0) {
                const user = await UserModel.findByPk(user_id, {
                    transaction: t,
                    lock: t.LOCK.UPDATE,
                });

                const currentBalance = Number(user.balance || 0);
                if (currentBalance < usedFromWallet) {
                    await t.rollback();
                    return res.status(400).json({ message: "Số dư ví không đủ." });
                }

                user.balance = currentBalance - usedFromWallet;
                await user.save({ transaction: t });
            }

            const order_code = `ORD-${Date.now()}`;
            const finalTotal = totalPrice + (shipping_fee || 0) - usedFromWallet;

            const newOrder = await OrderModel.create({
                user_id,
                promotion_id: promotion || null,
                promotion_user_id: promoUser?.id || null,
                name,
                phone,
                email,
                address,
                total_price: finalTotal,
                payment_method,
                order_code,
                shipping_address: address,
                note,
                shipping_fee: shipping_fee || 0,
                status: "pending",
                cancellation_reason: note || null,
                shipping_code: null,
                discount_amount: voucherDiscount,
                special_discount_amount: specialDiscount,
                wallet_balance: usedFromWallet,
            }, { transaction: t });

            const orderDetails = detailedCart.map(item => ({
    order_id: newOrder.id,
    product_variant_id: item.variant,
    quantity: item.quantity,
    price: item.price,
    auction_id: item.auction_id,
    promotion_product_id: item.promotion_product_id || null,
    promotion_applied_qty: item.promotion_applied_qty || 0
}));


            await OrderDetail.bulkCreate(orderDetails, { transaction: t });

            const successfullyOrderedProductIds = products.map(p => p.variant.id);

            await CartModel.destroy({
                where: {
                    user_id,
                    product_variant_id: successfullyOrderedProductIds
                },
                transaction: t
            });

            await t.commit();

            await OrderController.sendOrderConfirmationEmail(
                newOrder,
                { name, phone },
                products,
                email,
                new Date()
            );

            return res.status(201).json({
                success: true,
                message: "Đặt hàng thành công.",
                data: {
                    order: newOrder,
                    promotion_user_id: promoUser?.id || null,
                },
            });
        } catch (error) {
            await t.rollback();
            return res.status(500).json({
                success: false,
                message: "Lỗi máy chủ khi tạo đơn hàng.",
                error: error.message,
            });
        }
    }

    static async createMomoUrl(req, res) {
        const {
            products,
            user_id,
            name,
            phone,
            email,
            address,
            note,
            shipping_fee,
            promotion,
            promo_discount,
            voucher_discount,
            promotion_user_id: promotionUserIdFromClient
        } = req.body;

        if (!products || products.length === 0) {
            return res.status(400).json({ message: "Giỏ hàng trống." });
        }

        if (!user_id) {
            return res.status(400).json({ message: "Thiếu user_id trong yêu cầu." });
        }

        try {
            let totalPrice = 0;
            const detailedCart = [];

            for (const item of products) {
                const variant = item.variant;
                if (!variant) {
                    return res
                        .status(400)
                        .json({ message: "Thông tin biến thể sản phẩm bị thiếu." });
                }

                const price = parseFloat(variant.price);
                totalPrice += price * item.quantity;

                detailedCart.push({
                    product_id: variant.id,
                    name: variant.sku,
                    price: price,
                    quantity: item.quantity,
                    total: price * item.quantity,
                    auction_id: item.auction_id || null,
                });
            }

            let specialDiscount = parseFloat(promo_discount) || 0;
            specialDiscount = Math.min(specialDiscount, totalPrice);
            let priceAfterSpecial = totalPrice - specialDiscount;

            let discountAmount = 0;
            let selectedVoucher = null;
            let promotion_user_id = promotionUserIdFromClient || null;

            if (promotion) {
                selectedVoucher = await PromotionModel.findByPk(promotion);
                if (selectedVoucher) {
                    const now = new Date();
                    if (
                        selectedVoucher.status !== "active" ||
                        now < selectedVoucher.start_date ||
                        now > selectedVoucher.end_date ||
                        selectedVoucher.quantity <= 0 ||
                        totalPrice < parseFloat(selectedVoucher.min_price_threshold)
                    ) {
                        return res
                            .status(400)
                            .json({
                                message: "Mã khuyến mãi không hợp lệ hoặc không đủ điều kiện.",
                            });
                    }

                    if (selectedVoucher.special_promotion) {
                        const promoUser = await PromotionUserModel.findOne({
                            where: {
                                promotion_id: selectedVoucher.id,
                                user_id,
                                email_sent: true,
                                used: { [Op.not]: true },
                            },
                        });

                        if (!promoUser) {
                            return res
                                .status(403)
                                .json({
                                    message: "Bạn không đủ điều kiện sử dụng mã khuyến mãi.",
                                });
                        }
                        promotion_user_id = promoUser.id;
                    }

                    if (selectedVoucher.discount_type === "fixed") {
                        discountAmount = Math.min(
                            parseFloat(selectedVoucher.discount_value),
                            priceAfterSpecial
                        );
                    } else if (selectedVoucher.discount_type === "percentage") {
                        const maxPrice = parseFloat(
                            selectedVoucher.max_price || "999999999"
                        );
                        discountAmount = Math.min(
                            (priceAfterSpecial * parseFloat(selectedVoucher.discount_value)) /
                            100,
                            maxPrice
                        );
                    }
                }
            }

            const usedFromWallet = Number(req.body.wallet_balance || 0);
            const finalAmount = priceAfterSpecial - discountAmount;
            const shipping = parseFloat(shipping_fee) || 0;
            const finalTotalWithShipping = finalAmount + shipping;
            const amountAfterWallet = Math.max(0, finalTotalWithShipping - usedFromWallet);

            const simplifiedProducts = products.map((item) => ({
                variant: {
                    id: item.variant.id,
                    sku: item.variant.sku,
                    price: parseFloat(item.variant.price),
                },
                quantity: item.quantity,
                auction_id: item.auction_id || null,
            }));

            const order_code = req.body.orderId;

            const extraData = Buffer.from(
                JSON.stringify({
                    user_id,
                    name,
                    phone,
                    email,
                    address,
                    note,
                    products: simplifiedProducts,
                    promotion,
                    promotion_user_id,
                    orderId: order_code,
                    amount: finalTotalWithShipping,
                    originalAmount: totalPrice,
                    discountAmount: discountAmount || 0,
                    specialDiscount: specialDiscount,
                    shipping_fee: shipping_fee || 0,
                    voucher_discount,
                    wallet_balance: usedFromWallet
                })
            ).toString("base64");

            const endpoint = "https://test-payment.momo.vn/v2/gateway/api/create";
            const partnerCode = "MOMOBKUN20180529";
            const accessKey = "klm05TvNBzhg7h7j";
            const secretKey = "at67qH6mk8w5Y1nAyMoYKMWACiEi2bsa";
            const amount = amountAfterWallet.toString();
            const orderId = order_code;
            const requestId = Date.now().toString();

            const rawSignature = `accessKey=${accessKey}&amount=${amount}&extraData=${extraData}&ipnUrl=${BACKEND_URL}/payment-notification&orderId=${orderId}&orderInfo=MoMo&partnerCode=${partnerCode}&redirectUrl=${FRONTEND_URL}/cart&requestId=${requestId}&requestType=payWithATM`;

            const signature = crypto
                .createHmac("sha256", secretKey)
                .update(rawSignature)
                .digest("hex");

            const momoData = {
                partnerCode,
                partnerName: "Test",
                storeId: "MomoTestStore",
                requestId,
                amount,
                orderId,
                orderInfo: "MoMo",
                redirectUrl: `${FRONTEND_URL}/cart`,
                ipnUrl: `${BACKEND_URL}/payment-notification`,
                requestType: "payWithATM",
                extraData,
                lang: "vi",
                signature,
            };

            const response = await axios.post(endpoint, momoData, {
                headers: { "Content-Type": "application/json" },
            });

            if (response.data && response.data.payUrl) {
                return res.json({
                    success: true,
                    data: {
                        payUrl: response.data.payUrl,
                        order_code: order_code,
                        originalAmount: totalPrice,
                        discountAmount: discountAmount,
                        specialDiscount: specialDiscount,
                        finalAmount: finalAmount,
                    },
                });
            } else {
                return res.status(400).json({
                    success: false,
                    message: "Không thể tạo URL thanh toán MoMo.",
                    error: response.data,
                });
            }
        } catch (error) {
            if (error.response) {
                const momoError = error.response.data;
                console.error("Lỗi phản hồi MoMo:", momoError);

                if (momoError?.resultCode === 22) {
                    return res.status(400).json({
                        message:
                            "Số tiền thanh toán không hợp lệ: phải từ 10.000đ đến 50.000.000đ.",
                        error: momoError,
                    });
                }

                return res.status(400).json({
                    message: "Giao dịch bị từ chối bởi MoMo.",
                    error: momoError,
                });
            } else {
                console.error("Lỗi khác:", error.message);

                return res.status(500).json({
                    message: "Lỗi máy chủ khi tạo thanh toán.",
                    error: error.message,
                });
            }
        }
    }

    static async momoPaymentNotification(req, res) {
        const { resultCode, orderId, amount, extraData } = req.body;

        if (resultCode !== 0) {
            return res
                .status(200)
                .json({ message: "Thanh toán thất bại hoặc bị hủy." });
        }

        const t = await sequelize.transaction();
        try {
            const decoded = JSON.parse(
                Buffer.from(extraData, "base64").toString("utf-8")
            );

            const usedFromWallet = Number(decoded.wallet_balance || 0);

            if (usedFromWallet > 0) {
                const user = await UserModel.findByPk(user_id, {
                    transaction: t,
                    lock: t.LOCK.UPDATE
                });

                const currentBalance = Number(user.balance || 0);
                if (currentBalance < usedFromWallet) {
                    await t.rollback();
                    return res.status(400).json({ message: "Số dư ví không đủ." });
                }

                user.balance = currentBalance - usedFromWallet;
                await user.save({ transaction: t });
            }

            const {
                user_id,
                name,
                phone,
                email,
                address,
                note,
                products,
                promotion,
                shipping_fee,
                specialDiscount,
                discountAmount,
                promotion_user_id,
            } = decoded;

            let totalPrice = 0;
            const detailedCart = [];

            for (const item of products) {
                const variant = item.variant;
                if (!variant) {
                    console.error("Thiếu variant trong product:", item);
                    await t.rollback();
                    return res
                        .status(400)
                        .json({ message: "Thông tin biến thể sản phẩm bị thiếu." });
                }

                const variantExists = await ProductVariantModel.findByPk(variant.id, {
                    transaction: t,
                });
                if (!variantExists) {
                    console.error("Biến thể sản phẩm không tồn tại:", variant.id);
                    await t.rollback();
                    return res
                        .status(400)
                        .json({ message: "Biến thể sản phẩm không tồn tại." });
                }

                const price = parseFloat(variant.price);
                totalPrice += price * item.quantity;
                detailedCart.push({
                    product_id: variant.id,
                    name: variant.sku,
                    price: price,
                    quantity: item.quantity,
                    total: price * item.quantity,
                    auction_id: item.auction_id || null,
                });
            }

            let finalSpecialDiscount = parseFloat(specialDiscount) || 0;
            finalSpecialDiscount = Math.min(finalSpecialDiscount, totalPrice);
            let priceAfterSpecial = totalPrice - finalSpecialDiscount;

            let selectedVoucher = null;
            let promoUser = null;
            let finalAmount = priceAfterSpecial;

            if (promotion) {
                selectedVoucher = await PromotionModel.findByPk(promotion, { transaction: t, lock: t.LOCK.UPDATE });

                if (selectedVoucher) {
                    const now = new Date();
                    if (
                        selectedVoucher.status !== "active" ||
                        now < selectedVoucher.start_date ||
                        now > selectedVoucher.end_date ||
                        selectedVoucher.quantity <= 0 ||
                        priceAfterSpecial < parseFloat(selectedVoucher.min_price_threshold)
                    ) {
                        await t.rollback();
                        return res
                            .status(400)
                            .json({
                                message: "Mã khuyến mãi không hợp lệ hoặc không đủ điều kiện.",
                            });
                    }

                    if (selectedVoucher && promotion_user_id) {
                        promoUser = await PromotionUserModel.findOne({
                            where: {
                                id: parseInt(promotion_user_id),
                                user_id,
                                email_sent: true,
                                used: { [Op.not]: true },
                            },
                            transaction: t,
                            lock: t.LOCK.UPDATE,
                        });

                        if (!promoUser) {
                            await t.rollback();
                            return res
                                .status(403)
                                .json({
                                    message: "Bạn không đủ điều kiện sử dụng mã khuyến mãi.",
                                });
                        }

                        promoUser.used = true;
                        await promoUser.save({ transaction: t });
                    }

                    finalAmount = priceAfterSpecial - discountAmount;

                    selectedVoucher.quantity -= 1;
                    await selectedVoucher.save({ transaction: t });
                }
            }

            const shipping = parseFloat(shipping_fee) || 0;
            const finalTotalWithShipping = finalAmount + shipping;

            if (Math.abs(parseFloat(amount) - finalTotalWithShipping) > 1e-6) {
                console.error("Số tiền không khớp:", {
                    amount,
                    finalTotalWithShipping,
                });
                await t.rollback();
                return res
                    .status(400)
                    .json({
                        message: "Số tiền thanh toán không khớp với tổng tiền đơn hàng.",
                    });
            }

            const newOrder = await OrderModel.create(
                {
                    user_id,
                    promotion_id: promotion || null,
                    promotion_user_id:
                        promoUser?.id || parseInt(promotion_user_id) || null,
                    name,
                    phone,
                    email,
                    address,
                    total_price: parseFloat(amount),
                    payment_method: "Momo",
                    order_code: orderId,
                    shipping_address: address,
                    note: note || "",
                    shipping_fee: shipping,
                    status: "pending",
                    cancellation_reason: null,
                    shipping_code: null,
                    discount_amount: discountAmount || 0,
                    special_discount_amount: finalSpecialDiscount || 0,
                    wallet_balance: usedFromWallet,
                },
                { transaction: t }
            );

            const orderDetails = detailedCart.map((item) => ({
                order_id: newOrder.id,
                product_variant_id: item.product_id,
                quantity: item.quantity,
                price: item.price,
                auction_id: item.auction_id
            }));

            await OrderDetail.bulkCreate(orderDetails, { transaction: t });

            const successfullyOrderedProductIds = products.map((p) => p.variant.id || p.variant_id);

            await CartModel.destroy({
                where: {
                    user_id,
                    product_variant_id: successfullyOrderedProductIds,
                },
                transaction: t,
            });

            await t.commit();

            await OrderController.sendOrderConfirmationEmail(
                newOrder,
                { name, phone },
                products,
                email,
                new Date()
            );

            return res.status(200).json({
                success: true,
                message: "Đơn hàng đã được tạo sau khi thanh toán thành công.",
                data: {
                    order: newOrder,
                    successfullyOrderedProductIds,
                    promotion_user_id: promotion_user_id || null,
                },
            });
        } catch (err) {
            await t.rollback();
            console.error("Lỗi xử lý ipn:", err);
            return res
                .status(500)
                .json({
                    message: "Lỗi xử lý thông báo thanh toán.",
                    error: err.message,
                });
        }
    }

    static sortObject(obj) {
        const ordered = {};
        const keys = Object.keys(obj).sort();
        keys.forEach((key) => {
            if (obj[key] !== undefined && obj[key] !== null && obj[key] !== "") {
                ordered[key] = obj[key];
            }
        });
        return ordered;
    }

    static async createVNPayUrl(req, res) {
        try {
            const requiredEnvVars = [
                "VNPAY_TMN_CODE",
                "VNPAY_HASH_SECRET",
                "VNPAY_PAYMENT_URL",
                "VNPAY_RETURN_URL",
            ];
            for (const envVar of requiredEnvVars) {
                if (!process.env[envVar]) {
                    throw new Error(`Thiếu biến môi trường bắt buộc: ${envVar}`);
                }
            }

            let ipAddr = requestIp.getClientIp(req) || "127.0.0.1";

            const tmnCode = process.env.VNPAY_TMN_CODE.trim();
            const secretKey = process.env.VNPAY_HASH_SECRET.trim();

            const vnpUrl = process.env.VNPAY_PAYMENT_URL.trim();
            const returnUrl = process.env.VNPAY_RETURN_URL.trim();

            const rawAmount = Number(req.body.amount || 0);
            const usedFromWallet = Number(req.body.wallet_balance || 0);
            const amount = Math.floor(rawAmount - usedFromWallet);

            if (isNaN(amount) || amount <= 0 || amount > 9999999999) {
                return res
                    .status(400)
                    .json({ code: "03", message: "Số tiền không hợp lệ" });
            }

            const createDate = moment().format("YYYYMMDDHHmmss");
            const orderId = req.body.orderId || `VNPAY-${Date.now()}`;

            const extraData = {
                user_id: req.body.user_id,
                name: req.body.name,
                phone: req.body.phone,
                email: req.body.email,
                address: req.body.address,
                note: req.body.note,
                products: req.body.products.map((p) => ({
                    quantity: p.quantity,
                    variant_id: p.product_variant_id || p.variant?.id,
                    promotion_product_id: p.promotion_product_id,
                    price: p.variant?.price || p.price,
                    auction_id: p.auction_id || null,
                })),
                promotion: req.body.promotion,
                promotion_user_id: req.body.promotion_user_id || null,
                shipping_fee: req.body.shipping_fee,
                specialDiscount: req.body.promo_discount,
                discountAmount: req.body.voucher_discount,
                wallet_balance: req.body.wallet_balance || 0,
                orderId: orderId,
            };

            const redisKey = `order:${orderId}`;

            const saved = await RedisService.setData(redisKey, extraData, 86400);

            if (!saved) {
                throw new Error("Không thể lưu dữ liệu đơn hàng vào Redis");
            }

            const minimalOrderInfo = {
                orderId,
                userId: req.body.user_id,
                email: req.body.email,
                amount,
                redisKey,
            };

            const orderInfo = Buffer.from(JSON.stringify(minimalOrderInfo)).toString(
                "base64"
            );

            const vnpParams = {
                vnp_Version: "2.1.0",
                vnp_Command: "pay",
                vnp_TmnCode: tmnCode,
                vnp_Amount: amount * 100,
                vnp_CreateDate: createDate,
                vnp_CurrCode: "VND",
                vnp_IpAddr: ipAddr,
                vnp_Locale: "vn",
                vnp_OrderInfo: orderInfo,
                vnp_OrderType: req.body.orderType || "other",
                vnp_ReturnUrl: returnUrl,
                vnp_TxnRef: orderId,
                vnp_BankCode: req.body.bankCode || "",
            };

            const sortedParams = OrderController.sortObject(vnpParams);

            const signData = Object.entries(sortedParams)
                .map(
                    ([key, val]) =>
                        `${key}=${encodeURIComponent(val).replace(/%20/g, "+")}`
                )
                .join("&");

            const hmac = crypto.createHmac("sha512", secretKey);
            hmac.update(Buffer.from(signData, "utf-8"));
            const signed = hmac.digest("hex");

            sortedParams.vnp_SecureHash = signed;

            const queryString = Object.entries(sortedParams)
                .map(
                    ([key, val]) =>
                        `${key}=${encodeURIComponent(val).replace(/%20/g, "+")}`
                )
                .join("&");
            const paymentUrl = `${vnpUrl}?${queryString}`;

            return res.json({
                success: true,
                paymentUrl,
            });
        } catch (error) {
            console.error("Lỗi VNPay:", error);
            return res.status(500).json({
                success: false,
                message: error.message,
            });
        }
    }

    static async handleVNPayCallback(req, res) {
        const t = await sequelize.transaction();
        try {
            const vnpParams = req.query;

            const secureHash = vnpParams.vnp_SecureHash;
            const orderId = vnpParams.vnp_TxnRef || "unknown";
            const amount = vnpParams.vnp_Amount ? vnpParams.vnp_Amount / 100 : 0;

            const orderInfo = vnpParams.vnp_OrderInfo;

            delete vnpParams.vnp_SecureHash;
            delete vnpParams.vnp_SecureHashType;

            const sortedParams = OrderController.sortObject(vnpParams);

            const signData = Object.entries(sortedParams)
                .map(([key, val]) => `${key}=${encodeURIComponent(val).replace(/%20/g, "+")}`)
                .join("&");

            const secretKey = process.env.VNPAY_HASH_SECRET.trim();
            const hmac = crypto.createHmac("sha512", secretKey);
            const calculatedHash = hmac.update(signData, "utf-8").digest("hex");

            if (calculatedHash !== secureHash) {
                console.error("Chữ ký không hợp lệ");
                return res.redirect(
                    `${process.env.FRONTEND_URL}/payment/failed?error=Invalid_signature&orderId=${orderId}`
                );
            }

            if (vnpParams.vnp_ResponseCode !== "00") {
                console.error(`Giao dịch thất bại - Mã lỗi: ${vnpParams.vnp_ResponseCode}`);
                return res.redirect(
                    `${process.env.FRONTEND_URL}/payment/failed?error=Transaction_failed&code=${vnpParams.vnp_ResponseCode}&orderId=${orderId}`
                );
            }

            let minimalInfo;
            try {
                minimalInfo = JSON.parse(Buffer.from(orderInfo, "base64").toString("utf-8"));
                if (!minimalInfo.redisKey) {
                    throw new Error("Thiếu thông tin redisKey trong orderInfo");
                }
            } catch (decodeError) {
                console.error("Lỗi giải mã orderInfo:", decodeError.message);
                return res.redirect(
                    `${process.env.FRONTEND_URL}/payment/failed?error=Invalid_order_data&orderId=${orderId}`
                );
            }

            const decoded = await RedisService.getData(minimalInfo.redisKey);
            if (!decoded) {
                console.error("Không tìm thấy dữ liệu đơn hàng trong Redis");
                return res.redirect(
                    `${process.env.FRONTEND_URL}/payment/failed?error=Order_data_expired&orderId=${orderId}`
                );
            }
            await RedisService.deleteData(minimalInfo.redisKey);

            const {
                user_id,
                name,
                phone,
                email,
                address,
                note,
                products,
                promotion,
                shipping_fee,
                specialDiscount,
                discountAmount,
                promotion_user_id
            } = decoded;


            const usedFromWallet = Number(decoded.wallet_balance || 0);
            if (usedFromWallet > 0) {
                const user = await UserModel.findByPk(user_id, {
                    transaction: t,
                    lock: t.LOCK.UPDATE
                });

                const currentBalance = Number(user.balance || 0);
                if (currentBalance < usedFromWallet) {
                    await t.rollback();
                    return res.redirect(
                        `${process.env.FRONTEND_URL}/payment/failed?error=Insufficient_wallet_balance&orderId=${orderId}`
                    );
                }

                user.balance = currentBalance - usedFromWallet;
                await user.save({ transaction: t });
            }

            let totalPrice = 0;
            const detailedCart = [];
            const emailProducts = [];

            for (const item of products) {

                const promotion_product_id = item.promotion_product_id;

                if (!item.variant_id) {
                    console.error("Sản phẩm không hợp lệ (thiếu variant_id):", item);
                    await t.rollback();
                    return res.redirect(
                        `${process.env.FRONTEND_URL}/payment/failed?error=Invalid_product_data&orderId=${orderId}`
                    );
                }

                const productVariant = await ProductVariantModel.findByPk(item.variant_id, {
                    transaction: t,
                    lock: t.LOCK.UPDATE,
                });

                if (!productVariant) {
                    console.error(`Không tìm thấy sản phẩm: ${item.variant_id}`);
                    await t.rollback();
                    return res.redirect(
                        `${process.env.FRONTEND_URL}/payment/failed?error=Product_not_found&productId=${item.variant_id}&orderId=${orderId}`
                    );
                }
                if (promotion_product_id) {
                    const promoProduct = await PromotionProductModel.findOne({
                        where: {
                            promotion_id: promotion_product_id,
                            product_variant_id: item.variant_id,
                        },
                        transaction: t,
                        lock: t.LOCK.UPDATE,
                    });

                    if (promoProduct && promoProduct.variant_quantity > 0) {
                        const deducted = Math.min(promoProduct.variant_quantity, item.quantity);

                        // Trừ variant_quantity
                        promoProduct.variant_quantity -= deducted;
                        await promoProduct.save({ transaction: t });

                        // Trừ promotion.quantity dựa trên số vừa trừ từ variant
                        await PromotionModel.decrement(
                            { quantity: deducted },
                            {
                                where: { id: promotion_product_id },
                                transaction: t,
                            }
                        );
                    }
                }

                const price = parseFloat(productVariant.price);
                totalPrice += price * item.quantity;

                detailedCart.push({
                    product_id: item.variant_id,
                    name: productVariant.sku,
                    price: price,
                    quantity: item.quantity,
                    total: price * item.quantity,
                    auction_id: item.auction_id || null,
                });

                emailProducts.push({
                    quantity: item.quantity,
                    variant: {
                        id: productVariant.id,
                        sku: productVariant.sku,
                        price: price,
                        name: productVariant?.product?.name || productVariant.sku
                    }
                });

                if (productVariant.stock < item.quantity) {
                    await t.rollback();
                    return res.redirect(
                        `${process.env.FRONTEND_URL}/payment/failed?error=Insufficient_stock&productId=${item.variant_id}&orderId=${orderId}`
                    );
                }
                productVariant.stock -= item.quantity;
                await productVariant.save({ transaction: t });
            }

            if (promotion) {
                const normalPromotion = await PromotionModel.findByPk(promotion, {
                    transaction: t,
                    lock: t.LOCK.UPDATE,
                });

                if (normalPromotion && !normalPromotion.special_promotion) {
                    const now = new Date();
                    if (
                        normalPromotion.status !== "active" ||
                        now < normalPromotion.start_date ||
                        now > normalPromotion.end_date ||
                        normalPromotion.quantity <= 0 ||
                        totalPrice < parseFloat(normalPromotion.min_price_threshold)
                    ) {
                        await t.rollback();
                        return res.redirect(
                            `${process.env.FRONTEND_URL}/payment/failed?error=Invalid_normal_promotion&orderId=${orderId}`
                        );
                    }

                    normalPromotion.quantity = Math.max(0, normalPromotion.quantity - 1);
                    await normalPromotion.save({ transaction: t });
                }
            }

            let promoUser = null;
            if (promotion_user_id) {
                promoUser = await PromotionUserModel.findOne({
                    where: {
                        id: parseInt(promotion_user_id),
                        user_id,
                        email_sent: true,
                        used: false,
                    },
                    include: [
                        { model: PromotionModel, as: "promotion", required: true },
                    ],
                    transaction: t,
                    lock: t.LOCK.UPDATE,
                });

                if (!promoUser || !promoUser.promotion) {
                    await t.rollback();
                    return res.redirect(
                        `${process.env.FRONTEND_URL}/payment/failed?error=Invalid_special_promotion&orderId=${orderId}`
                    );
                }

                const specialPromotion = promoUser.promotion;
                const now = new Date();
                if (
                    specialPromotion.status !== "active" ||
                    now < specialPromotion.start_date ||
                    now > specialPromotion.end_date ||
                    specialPromotion.quantity <= 0 ||
                    totalPrice < specialPromotion.min_price_threshold
                ) {
                    await t.rollback();
                    return res.redirect(
                        `${process.env.FRONTEND_URL}/payment/failed?error=Invalid_special_promotion&orderId=${orderId}`
                    );
                }

                promoUser.used = true;
                await promoUser.save({ transaction: t });
                specialPromotion.quantity = Math.max(0, specialPromotion.quantity - 1);
                await specialPromotion.save({ transaction: t });
            }

            if (!decoded.address) {
                console.error("Thiếu địa chỉ giao hàng");
                await t.rollback();
                return res.redirect(
                    `${process.env.FRONTEND_URL}/payment/failed?error=Missing_shipping_address&orderId=${orderId}`
                );
            }

            const newOrder = await OrderModel.create(
                {
                    user_id,
                    promotion_id: promotion || null,
                    promotion_user_id: promoUser?.id || null,
                    name: decoded.name || "",
                    phone: decoded.phone || "",
                    email: decoded.email,
                    address: decoded.address,
                    total_price: amount,
                    payment_method: "VNPay",
                    order_code: orderId,
                    shipping_address: decoded.address,
                    note: decoded.note || "",
                    shipping_fee: parseFloat(decoded.shipping_fee) || 0,
                    status: "pending",
                    cancellation_reason: null,
                    shipping_code: null,
                    discount_amount: parseFloat(decoded.discountAmount) || 0,
                    special_discount_amount: parseFloat(decoded.specialDiscount) || 0,
                    wallet_balance: usedFromWallet,
                },
                { transaction: t }
            );

            const orderDetails = detailedCart.map((item) => ({
                order_id: newOrder.id,
                product_variant_id: item.product_id,
                quantity: item.quantity,
                price: item.price,
                auction_id: item.auction_id
            }));
            await OrderDetail.bulkCreate(orderDetails, { transaction: t });

            const successfullyOrderedProductIds = products.map((p) => p.variant_id || p.variant_id);
            await CartModel.destroy({
                where: {
                    user_id,
                    product_variant_id: successfullyOrderedProductIds,
                },
                transaction: t,
            });

            await t.commit();

            try {
                await OrderController.sendOrderConfirmationEmail(
                    newOrder,
                    { name, phone },
                    emailProducts,
                    email,
                    new Date()
                );
            } catch (mailErr) {
                console.error("Lỗi gửi email xác nhận đơn hàng:", mailErr);
            }

            return res.redirect("https://web-dong-ho-fe-git-main-phucle.vercel.app/cart");
        } catch (error) {
            if (t && t.finished !== "commit") {
                try {
                    await t.rollback();
                } catch (rbErr) {
                    console.error("Rollback error:", rbErr);
                }
            }
            const orderId = req.query.vnp_TxnRef || "unknown";
            return res.redirect(
                `${process.env.FRONTEND_URL}/payment/failed?error=Server_error&orderId=${orderId}`
            );
        }
    }

    static async sendOrderConfirmationEmail(
        order,
        user,
        products,
        customerEmail,
        currentDateTime
    ) {
        try {
            let transporter = nodemailer.createTransport({
                service: "gmail",
                auth: {
                    user: process.env.EMAIL_USER,
                    pass: process.env.EMAIL_PASS,
                },
            });

            const currentDateTimeUTC = new Date();
            const formattedDate = currentDateTimeUTC.toLocaleString("vi-VN", {
                timeZone: "Asia/Ho_Chi_Minh",
                hour12: false,
            });
            const formattedPrice = new Intl.NumberFormat("vi-VN").format(
                order.total_price
            );
            const formattedShipping = new Intl.NumberFormat("vi-VN").format(
                order.shipping_fee || 0
            );

            const productsHTML = products
                .map((item) => {
                    const variant = item.variant;
                    const productName =
                        variant?.product?.name || "";
                    const price = new Intl.NumberFormat("vi-VN").format(
                        variant?.price || 0
                    );
                    const imageUrl = variant?.images?.[0]?.image_url;
                    const attributeValues = variant?.attributeValues ?? [];
                    const attributes = Array.isArray(attributeValues)
                        ? attributeValues.map((attr) => attr.value).join(" - ")
                        : "Không xác định";

                    return `
            <div class="product">
                <img src="${imageUrl}" alt="${productName}">
                <div class="product-info">
                <p style="margin-left: 10px;"><strong>${productName} (${attributes})</strong></p>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-left: 10px; margin-top: 4px;">
                    <span style="font-size: 14px;">${price}₫</span>
                <span style="font-size: 13px; color: #555; margin-left: auto;">×${item.quantity}</span>
                </div>
                </div>
            </div>
            `;
                })
                .join("");

            const subtotal = products.reduce(
                (sum, item) => sum + item.variant.price * item.quantity,
                0
            );
            const discount = order.discount_amount || 0;
            const shippingFee = order.shipping_fee || 0;
            const total = subtotal + shippingFee - discount;

            const htmlContent = `
        <!DOCTYPE html>
        <html lang="vi">
        <head>
            <meta charset="UTF-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
            <title>Xác nhận đơn hàng</title>
            <style>
                body {
                    font-family: Arial, sans-serif;
                    background: #f5f5f5;
                    padding: 20px;
                    color: #333;
                }
                .order-container {
                    max-width: 400px;
                    margin: auto;
                    background: #fff;
                    border-radius: 8px;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                    padding: 16px;
                }
                .shop-name {
                    font-weight: bold;
                    font-size: 16px;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    margin-bottom: 12px;
                }
                .product {
                    display: flex;
                    gap: 10px;
                    margin: 16px 0;
                    border-bottom: 1px solid #eee;
                    padding-bottom: 16px;
                }
                .product img {
                    width: 80px;
                    height: 80px;
                    object-fit: cover;
                    border: 1px solid #ddd;
                    border-radius: 4px;
                }
                .product-info {
                    flex-grow: 1;
                    font-size: 13px;
                }
                .price {
                    font-weight: bold;
                    font-size: 14px;
                    margin-top: 4px;
                }
                .summary {
                    margin-top: 20px;
                }
                .summary-title {
                    font-weight: bold;
                    margin-bottom: 10px;
                    font-size: 15px;
                }
                .summary-row {
                    display: flex;
                    justify-content: space-between;
                    font-size: 14px;
                    margin: 6px 0;
                }
                .total {
                    font-weight: bold;
                    font-size: 15px;
                    border-top: 1px solid #ddd;
                    padding-top: 10px;
                }
                .discount {
                    color: #008000;
                }
            </style>
        </head>
        <body>
            <div class="order-container">

                ${productsHTML}

                <div style="border-bottom: 1px solid #eee; padding-bottom: 12px; margin-bottom: 16px;">
                    <div style="display: flex; justify-content: space-between; width: 100%; margin-bottom: 8px;">
                        <span style="color: #666;">Mã đơn hàng:</span>
                        <span style="font-size: 13px; color: #555; margin-left: auto;"">${order.order_code
                }</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; width: 100%; margin-bottom: 8px;">
                        <span style="color: #666;">Ngày đặt hàng:</span>
                        <span style="font-size: 13px; color: #555; margin-left: auto;"">${formattedDate}</span>
                    </div>
                </div>

                <div class="summary">
                    <div class="summary-title">Tóm tắt kiện hàng</div>

                    <div class="summary-row">
                        <span>Tổng phụ</span>
                        <span style="font-size: 13px; color: #555; margin-left: auto;">${new Intl.NumberFormat(
                    "vi-VN"
                ).format(subtotal)}₫</span>
                    </div>

                    <div class="summary-row">
                        <span>Vận chuyển</span>
                        <span style="font-size: 13px; color: #555; margin-left: auto;">+ ${new Intl.NumberFormat(
                    "vi-VN"
                ).format(shippingFee)}₫</span>
                    </div>

                    ${discount > 0
                    ? `
                    <div class="summary-row">
                        <span>Phiếu giảm giá</span>
                        <span style="font-size: 13px; color: #555; margin-left: auto;">- ${new Intl.NumberFormat(
                        "vi-VN"
                    ).format(discount)}₫</span>
                    </div>
                    `
                    : ""
                }

                    <div class="summary-row total">
                        <span>Tổng (${products.length} mặt hàng)</span>
                        <span style="font-size: 13px; color: #555; margin-left: auto;">${new Intl.NumberFormat(
                    "vi-VN"
                ).format(total)}₫</span>
                    </div>
                </div>
                <div style="margin-top: 24px;">
                <div style="font-weight: bold; margin-bottom: 6px; border-bottom: 1px solid #eee; padding-bottom: 12px; margin-bottom: 16px">Địa chỉ vận chuyển</div>
                <div style="font-size: 14px; color: #333;">
                    <div>Họ và tên: ${user?.name || "Tên không xác định"}</div>
                    <div>Số điện thoại: (+84)${user?.phone || ""}</div>
                    <div>Địa chỉ: ${order?.shipping_address || "Địa chỉ không có"
                }</div>
                </div>
            </div>
            </div>
        </body>
        </html>
        `;

            const mailOptions = {
                from: `"Cửa hàng của bạn" <${process.env.EMAIL_USER}>`,
                to: customerEmail,
                subject: `Xác nhận đơn hàng #${order.order_code}`,
                html: htmlContent,
            };

            await transporter.sendMail(mailOptions);
        } catch (error) {
            console.error("Lỗi gửi email xác nhận đơn hàng:", error);
            throw new Error("Không thể gửi email xác nhận đơn hàng.");
        }
    }

    static async getBalance(req, res) {
        try {
            const userId = req.user.id;

            const user = await UserModel.findByPk(userId);
            if (!user) {
                return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng' });
            }

            return res.status(200).json({
                success: true,
                balance: user.balance || 0,
            });
        } catch (error) {
            console.error('Lỗi khi lấy balance:', error);
            return res.status(500).json({ success: false, message: 'Lỗi server' });
        }
    }

    static async createStripeTopupSession(req, res) {
        try {
            const { amount } = req.body;
            const userId = req.user.id;

            const parsedAmount = parseInt(amount);
            if (!parsedAmount || isNaN(parsedAmount) || parsedAmount < 13000) {
                return res.status(400).json({ message: "Số tiền nạp không hợp lệ (tối thiểu 13,000₫)." });
            }

            const session = await stripe.checkout.sessions.create({
                payment_method_types: ["card"],
                mode: "payment",
                line_items: [
                    {
                        price_data: {
                            currency: "vnd",
                            product_data: {
                                name: "Nạp tiền vào ví",
                            },
                            unit_amount: parsedAmount,
                        },
                        quantity: 1,
                    },
                ],
                success_url: `${process.env.FRONTEND_URL}/profile#payment`,
                cancel_url: `${process.env.FRONTEND_URL}/profile#payment`,
                metadata: {
                    userId,
                    topupAmount: parsedAmount,
                },
            });

            return res.status(200).json({ url: session.url });
        } catch (err) {
            console.error("Stripe Topup Error:", err);
            return res.status(500).json({ message: "Lỗi tạo phiên thanh toán Stripe" });
        }
    }

    static async handleWebhook(req, res) {
        const sig = req.headers["stripe-signature"];

        try {
            const event = stripe.webhooks.constructEvent(
                req.rawBody,
                sig,
                process.env.STRIPE_WEBHOOK_SECRET
            );

            if (event.type === "checkout.session.completed") {
                const session = event.data.object;

                if (session.payment_status !== "paid") {
                    console.warn("Phiên chưa thanh toán, bỏ qua");
                    return res.status(200).json({ skipped: true });
                }

                const userId = session.metadata?.userId;
                const amount = parseInt(session.metadata?.topupAmount);

                if (!userId || isNaN(amount)) {
                    return res.status(400).json({ message: "Thiếu thông tin metadata" });
                }

                // (Tùy chọn) kiểm tra nếu bạn có lưu log session id:
                // const existing = await StripeSessionLogModel.findOne({ where: { session_id: session.id } });
                // if (existing) return res.status(200).json({ message: "Đã xử lý trước đó" });

                const user = await UserModel.findOne({ where: { id: userId } });
                if (!user) return res.status(404).json({ message: "Không tìm thấy user" });

                user.balance = (parseInt(user.balance) || 0) + amount;
                await WithdrawRequestsModel.create({
                    user_id: userId,
                    amount,
                    method: 'bank',
                    bank_account: 'stripe-topup',
                    bank_name: 'Stripe',
                    status: 'approved',
                    note: 'Nạp tiền từ Stripe',
                    type: 'recharge'
                });

                await user.save();

                await OrderController.sendTopUpEmail(user, amount);

                return res.status(200).json({ received: true });
            }

            return res.status(200).json({ ignored: true });
        } catch (err) {
            console.error("Webhook error:", {
                message: err.message,
                stack: err.stack,
                rawBody: req.rawBody,
                headers: req.headers,
            });
            return res.status(400).send(`Webhook Error: ${err.message}`);
        }
    }

    static async sendTopUpEmail(user, amount) {
        try {
            const formattedAmount = new Intl.NumberFormat('vi-VN').format(amount);
            const formattedBalance = new Intl.NumberFormat('vi-VN').format(user.balance);

            let transporter = nodemailer.createTransport({
                service: "gmail",
                auth: {
                    user: process.env.EMAIL_USER,
                    pass: process.env.EMAIL_PASS,
                },
            });

            const mailOptions = {
                from: process.env.EMAIL_USER,
                to: user.email,
                subject: 'Nạp tiền vào ví thành công',
                html: `
        <html>
        <head>
          <meta charset="UTF-8" />
        </head>
        <body style="font-family: Arial, sans-serif; color: #333;">
          <p>Chào ${user.full_name || user.name || "bạn"},</p>
          <p>Bạn vừa nạp thành công <strong>${formattedAmount}₫</strong> vào ví.</p>
          <p><strong>Số dư hiện tại:</strong> ${formattedBalance}₫</p>
          <p>Cảm ơn bạn đã sử dụng dịch vụ của chúng tôi.</p>
          <hr />
          <p style="color: #555;"><em>Nếu có bất kỳ sai sót nào, vui lòng liên hệ chúng tôi để được hỗ trợ xử lý:</em></p>
          <ul>
            <li>Điện thoại / Zalo: <strong>0379 169 731</strong></li>
            <li>Email: <strong>phuc628780@gmail.com</strong></li>
          </ul>
          <p>-- Hệ thống Đồng Hồ TimesMaster --</p>
        </body>
        </html>
      `,
            };

            await transporter.sendMail(mailOptions);
            console.log("Gửi email nạp tiền thành công");
        } catch (err) {
            console.error("Gửi mail nạp tiền thất bại:", err);
        }
    }

    static async getCoin(req, res) {
        try {
            const userId = req.user.id;

            const user = await UserModel.findByPk(userId);
            if (!user) {
                return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng' });
            }

            return res.status(200).json({
                success: true,
                coin: user.coin || 0,
            });
        } catch (error) {
            console.error('Lỗi khi lấy coin:', error);
            return res.status(500).json({ success: false, message: 'Lỗi server' });
        }
    }

}

module.exports = OrderController;
