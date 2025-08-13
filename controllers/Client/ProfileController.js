const { Op } = require("sequelize");
const OrderModel = require("../../models/ordersModel");
const CartItemModel = require("../../models/cartDetailsModel");

class ProfileController {
  // Thống kê đơn hàng: hoàn thành & đang xử lý
  static async getOrderStats(req, res) {
    try {
      const { id } = req.params;

      if (!id || isNaN(id)) {
        return res.status(400).json({
          success: false,
          message: "ID người dùng không hợp lệ!",
        });
      }

      const totalCompletedOrders = await OrderModel.count({
        where: {
          user_id: id,
          status: {
            [Op.in]: ["delivered", "completed"], // đơn đã giao hoặc hoàn tất
          },
        },
      });

      const totalProcessingOrders = await OrderModel.count({
        where: {
          user_id: id,
          status: {
            [Op.in]: ["pending", "confirmed", "shipping"], // đơn đang xử lý
          },
        },
      });

      return res.status(200).json({
        success: true,
        message: "Lấy thống kê đơn hàng thành công!",
        data: {
          totalCompletedOrders,
          totalProcessingOrders,
        },
      });
    } catch (error) {
      console.error("Lỗi khi lấy thống kê đơn hàng:", error);
      return res.status(500).json({
        success: false,
        message: "Lỗi máy chủ!",
      });
    }
  }

  // Tổng đơn hàng mới (mới đặt)
 static async getTotalNewOrders(req, res) {
  try {
    const userId = req.params.id; // Hoặc req.user.id nếu lấy từ JWT

    const currentDate = new Date();
    const fromDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const toDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);

    const total = await OrderModel.count({
      where: {
        user_id: userId,
        created_at: { // ✅ Sửa lại cho đúng tên cột DB
          [Op.between]: [fromDate, toDate],
        },
      },
    });

    return res.json({
      success: true,
      message: "Lấy tổng đơn hàng trong tháng thành công!",
      data: { totalNewOrders: total || 0 },
    });
  } catch (error) {
    console.error("Lỗi khi lấy tổng đơn hàng trong tháng:", error);
    return res.status(500).json({ success: false, message: "Lỗi máy chủ!" });
  }
}


  // Tổng số sản phẩm trong giỏ
  static async getTotalCartItems(req, res) {
    try {
      const { id: userId } = req.params;

      const total = await CartItemModel.sum("quantity", {
        where: { user_id: userId },
      });

      return res.json({
        success: true,
        message: "Lấy tổng sản phẩm trong giỏ thành công!",
        data: { totalCartItems: total || 0 },
      });
    } catch (error) {
      console.error("Lỗi khi lấy tổng giỏ hàng:", error);
      return res
        .status(500)
        .json({ success: false, message: "Lỗi máy chủ!" });
    }
  }
}

module.exports = ProfileController;
