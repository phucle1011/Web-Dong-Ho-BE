const CommentModel = require('../../models/commentsModel');
const UserModel = require('../../models/usersModel');
const OrderDetailModel = require('../../models/orderDetailsModel');
const ProductModel = require('../../models/productsModel');
const ProductVariantsModel = require('../../models/productVariantsModel');
const { Op } = require('sequelize');

exports.getAllReviews = async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
     
    
    if (isNaN(userId)) {
      return res.status(400).json({ 
        success: false,
        error: 'ID người dùng không hợp lệ' 
      });
    }

    const reviews = await CommentModel.findAll({
      where: { 
        user_id: userId,
        comment_text: { [Op.ne]: null }
      },
      attributes: ['id', 'user_id', 'order_detail_id', 'rating', 'comment_text', 'created_at', 'updated_at'], // Explicitly exclude product_id
      include: [
        {
          model: UserModel,
          as: 'user',
          attributes: ['id', 'name', 'avatar']
        },
        {
          model: OrderDetailModel,
          as: 'orderDetail',
          attributes: ['product_variant_id'],
          include: [{
            model: ProductVariantsModel,
            as: 'variant',
            attributes: ['id'],
            include: [{
              model: ProductModel,
              as: 'product',
              attributes: ['id', 'name', 'thumbnail']
            }]
          }]
        }
      ],
      order: [['created_at', 'DESC']],
      limit: 20
    });

    const formattedReviews = reviews.map(review => ({
      id: review.id,
      rating: review.rating || 0,
      comment: review.comment_text || '',
      userInfo: {
        name: review.user?.name || 'Unknown User',
        avatar: review.user?.avatar || null
      },
      productInfo: review.orderDetail?.variant?.product ? {
        id: review.orderDetail.variant.product.id,
        name: review.orderDetail.variant.product.name,
        image: review.orderDetail.variant.product.thumbnail || '/default-product.jpg'
      } : null,
      createdAt: review.created_at
    }));

    return res.status(200).json({
      success: true,
      count: formattedReviews.length,
      data: formattedReviews
    });

  } catch (error) {
    console.error('[ERROR] getAllReviews:', error);
    return res.status(500).json({
      success: false,
      error: 'Đã xảy ra lỗi khi lấy dữ liệu đánh giá',
      details: process.env.NODE_ENV === 'development' ? {
        message: error.message,
        stack: error.stack
      } : undefined
    });
  }
};