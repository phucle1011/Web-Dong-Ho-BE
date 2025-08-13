const CartDetailModel = require('../../models/cartDetailsModel');
const UserModel = require('../../models/usersModel');
const ProductVariantModel = require('../../models/productVariantsModel');
const ProductModel = require('../../models/productsModel');
const { Op } = require('sequelize');

class CartController {
  static async getAllCart(req, res) {
    try {
      const { search } = req.query;
      let whereUser = {};
      let whereProduct = {};

      if (search) {
        whereUser = {
          name: {
            [Op.like]: `%${search}%`
          }
        };

        whereProduct = {
          name: {
            [Op.like]: `%${search}%`
          }
        };
      }

      const carts = await CartDetailModel.findAll({
        include: [
          {
            model: UserModel,
            as: 'user',
            attributes: ['id', 'name', 'email'],
            where: search ? whereUser : undefined,
          },
          {
            model: ProductVariantModel,
            as: 'variant',
            attributes: ['id', 'sku', 'price'],
            include: {
              model: ProductModel,
              as: 'product',
              attributes: ['name'],
              where: search ? whereProduct : undefined,
            },
          },
        ],
      });

      return res.status(200).json({ success: true, data: carts });
    } catch (error) {
      console.error('Error in CartController.getAllCart:', error);
      return res.status(500).json({ success: false, message: 'Lỗi server khi lấy giỏ hàng' });
    }
  }
  static async getCartByUserId(req, res) {
  try {
    const { userId } = req.params;

    const cartDetails = await CartDetailModel.findAll({
      where: { user_id: userId },
      include: [
        {
          model: UserModel,
          as: 'user',
          attributes: ['id', 'name', 'email']
        },
        {
          model: ProductVariantModel,
          as: 'variant',
          attributes: ['id', 'sku', 'price'],
          include: {
            model: ProductModel,
            as: 'product',
            attributes: ['name']
          }
        }
      ]
    });

    if (!cartDetails || cartDetails.length === 0) {
      return res.status(404).json({ success: false, message: 'Giỏ hàng không tồn tại' });
    }

    return res.status(200).json({ success: true, data: cartDetails });
  } catch (error) {
    console.error('Error in getCartByUserId:', error);
    return res.status(500).json({ success: false, message: 'Lỗi server khi lấy giỏ hàng' });
  }
}

}

module.exports = CartController;