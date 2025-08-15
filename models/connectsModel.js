const UserModel = require('./usersModel');
const AddressesModel = require('./addressesModel');
const NotificationModel = require('./notificationsModel');
const ProductModel = require('./productsModel');
const CommentModel = require('./commentsModel');
const OrderModel = require('./ordersModel');
const WishlistModel = require('./wishlistsModel');
const CategoriesModel = require('./categoriesModel');
const CartDetailModel = require('./cartDetailsModel');
const PromotionModel = require('./promotionsModel');
const OrderDetailModel = require('../models/orderDetailsModel');
const BrandModel = require('../models/brandsModel');
const ProductAttributeModel = require('../models/productAttributesModel');
const ProductVariantAttributeValueModel = require('../models/productVariantAttributeValuesModel');
const VariantImageModel = require('../models/variantImagesModel');
const ProductVariantsModel = require('../models/productVariantsModel');
const PromotionProductModel = require('../models/promotionProductsModel');
const Promotion = require('../models/promotionsModel');
const CommentImageModel = require('../models/commentImagesModel');
const PromotionUserModel = require('./promotionUsersModel');
const BlogModel = require('../models/blogsModel');
const Notification_promotionsModel = require('./FlashSaleModel');
const WithdrawRequestsModel = require('../models/withdrawRequestsModel');
const BlogCategory = require('../models/blogsCategoryModel');
const AuctionsModel = require('../models/auctionsModel');
const AuctionBidModel = require('../models/auctionBidsModel');


//--------------------- [ Thiết lập quan hệ ]------------------------

// User - Address
UserModel.hasMany(AddressesModel, { foreignKey: 'user_id', as: 'addresses' });
AddressesModel.belongsTo(UserModel, { foreignKey: 'user_id', as: 'user' });



// Product - Comment
ProductModel.hasMany(CommentModel, { foreignKey: 'product_id', as: 'comments' });
CommentModel.belongsTo(ProductModel, { foreignKey: 'product_id', as: 'commentedProduct' });

// OrderDetails - Product
// OrderDetailModel.belongsTo(ProductModel, { foreignKey: 'product_id', as: 'orderedProduct' });
// ProductModel.hasMany(OrderDetailModel, { foreignKey: 'product_id', as: 'orderItems' });

// Blog - User
BlogModel.belongsTo(UserModel, { foreignKey: 'user_id', as: 'user' });
UserModel.hasMany(BlogModel, { foreignKey: 'user_id', as: 'blogs' });

// Blog - blogCategory
BlogModel.belongsTo(BlogCategory, { foreignKey: 'blogCategory_id', as: 'category' });
BlogCategory.hasMany(BlogModel, { foreignKey: 'blogCategory_id' });

// User - Comment
CommentModel.belongsTo(UserModel, { foreignKey: 'user_id', as: 'user' });

// Order - Comment
CommentModel.belongsTo(OrderModel, { foreignKey: 'order_id', as: 'order' });

// User - Order
UserModel.hasMany(OrderModel, { foreignKey: 'user_id', as: 'orders' });
OrderModel.belongsTo(UserModel, { foreignKey: 'user_id', as: 'user' });

// User - Wishlist
UserModel.hasMany(WishlistModel, { foreignKey: 'user_id', as: 'wishlists' });
WishlistModel.belongsTo(UserModel, { foreignKey: 'user_id', as: 'user' });

// Wishlist - ProductVariant
ProductVariantsModel.hasMany(WishlistModel, { foreignKey: 'product_variant_id', as: 'wishlists' });
WishlistModel.belongsTo(ProductVariantsModel, { foreignKey: 'product_variant_id', as: 'variant' });

// Category - Product
CategoriesModel.hasMany(ProductModel, { foreignKey: 'category_id', as: 'products' });
ProductModel.belongsTo(CategoriesModel, { foreignKey: 'category_id', as: 'category' });

// comment - OrderDetail
CommentModel.belongsTo(OrderDetailModel, { foreignKey: 'order_detail_id', as: 'orderDetail' });
OrderDetailModel.hasMany(CommentModel, { foreignKey: 'order_detail_id', as: 'comments' });

// Comment images 
CommentModel.hasMany(CommentImageModel, { foreignKey: 'comment_id', as: 'commentImages' });
CommentImageModel.belongsTo(CommentModel, { foreignKey: 'comment_id', as: 'comment' });

// User - Cart
UserModel.hasMany(CartDetailModel, { foreignKey: 'user_id', as: 'carts' });
CartDetailModel.belongsTo(UserModel, { foreignKey: 'user_id', as: 'user' });

// Product - ProductVariant
ProductModel.hasMany(ProductVariantsModel, { foreignKey: 'product_id', as: 'variants' });
ProductVariantsModel.belongsTo(ProductModel, { foreignKey: 'product_id', as: 'product' }); // ✅ alias: product

// ProductVariant - Cart
ProductVariantsModel.hasMany(CartDetailModel, { foreignKey: 'product_variant_id', as: 'carts' });
CartDetailModel.belongsTo(ProductVariantsModel, { foreignKey: 'product_variant_id', as: 'variant' }); // ✅ alias: variant

// Brand - Product
BrandModel.hasMany(ProductModel, { foreignKey: 'brand_id', as: 'products' });
ProductModel.belongsTo(BrandModel, { foreignKey: 'brand_id', as: 'brand' });

// Orders - OrderDetails
OrderModel.hasMany(OrderDetailModel, { foreignKey: 'order_id', as: 'orderDetails' });
OrderDetailModel.belongsTo(OrderModel, { foreignKey: 'order_id', as: 'order' });

// ProductVariant - ProductVariantAttributeValue
ProductVariantsModel.hasMany(ProductVariantAttributeValueModel, { foreignKey: 'product_variant_id', as: 'attributeValues' });
ProductVariantAttributeValueModel.belongsTo(ProductVariantsModel, { foreignKey: 'product_variant_id', as: 'variant' }); // ✅ alias: variant

// ProductAttribute - ProductVariantAttributeValue
ProductAttributeModel.hasMany(ProductVariantAttributeValueModel, { foreignKey: 'product_attribute_id', as: 'values' });
ProductVariantAttributeValueModel.belongsTo(ProductAttributeModel, { foreignKey: 'product_attribute_id', as: 'attribute' });

// ProductVariant - VariantImage
ProductVariantsModel.hasMany(VariantImageModel, { foreignKey: 'variant_id', as: 'images' });
VariantImageModel.belongsTo(ProductVariantsModel, { foreignKey: 'variant_id', as: 'variant' }); // ✅ alias: variant

// OrderDetail - ProductVariant
OrderDetailModel.belongsTo(ProductVariantsModel, { foreignKey: 'product_variant_id', as: 'variant' });
ProductVariantsModel.hasMany(OrderDetailModel, { foreignKey: 'product_variant_id', as: 'orderDetails' });

// PromotionProduct - ProductVariant
PromotionProductModel.belongsTo(ProductVariantsModel, { foreignKey: 'product_variant_id' });
PromotionModel.hasMany(PromotionProductModel, { foreignKey: 'promotion_id' });

UserModel.belongsToMany(PromotionModel, { through: PromotionUserModel, foreignKey: 'user_id', otherKey: 'promotion_id' });
PromotionModel.belongsToMany(UserModel, { through: PromotionUserModel, foreignKey: 'promotion_id', otherKey: 'user_id' });

// Promotion - User (Many-to-Many thông qua promotion_users)
UserModel.hasMany(PromotionUserModel, { foreignKey: 'user_id', as: 'promotionUsers' });
PromotionUserModel.belongsTo(UserModel, { foreignKey: 'user_id' });

// PromotionUser belongsTo Promotion
PromotionUserModel.belongsTo(PromotionModel, { foreignKey: 'promotion_id', as: 'Promotion' });
PromotionModel.hasMany(PromotionUserModel, { foreignKey: 'promotion_id', as: 'promotionUsers' });

// ProductVariant - Product
ProductVariantsModel.belongsTo(ProductModel, { foreignKey: 'product_id' });

PromotionProductModel.belongsTo(PromotionModel, { foreignKey: 'promotion_id' });
// Quan hệ một chiều đã có
PromotionProductModel.belongsTo(Promotion, { foreignKey: 'promotion_id' });

//Bổ sung chiều ngược lại
Promotion.hasMany(PromotionProductModel, { foreignKey: 'promotion_id' });

// ✅ FIXED: PromotionProduct - ProductVariant
PromotionProductModel.belongsTo(ProductVariantsModel, { foreignKey: 'product_variant_id', as: 'variant' }); // CHUẨN
ProductVariantsModel.hasMany(PromotionProductModel, { foreignKey: 'product_variant_id', as: 'promotionProducts' });

// ✅ FIXED: PromotionProduct - Promotion
PromotionProductModel.belongsTo(PromotionModel, { foreignKey: 'promotion_id', as: 'promotion' }); // CHUẨN
PromotionModel.hasMany(PromotionProductModel, { foreignKey: 'promotion_id', as: 'promotionProducts' });

OrderModel.belongsTo(PromotionModel, { foreignKey: 'promotion_id', as: 'promotion' });
PromotionModel.hasMany(OrderModel, { foreignKey: 'promotion_id', as: 'orders' });

OrderDetailModel.belongsTo(PromotionProductModel, {
  foreignKey: 'promotion_product_id',
  as: 'promotionProduct',
});
PromotionProductModel.hasMany(OrderDetailModel, {
  foreignKey: 'promotion_product_id',
  as: 'orderDetails',
});


// Notification hasMany FlashSales
NotificationModel.hasMany(Notification_promotionsModel, {
  foreignKey: 'notification_id',
  as: 'notification_promotions'
});

// FlashSale belongsTo Notification
Notification_promotionsModel.belongsTo(NotificationModel, {
  foreignKey: 'notification_id',
  as: 'notification'
});

// FlashSale belongsTo Promotion
Notification_promotionsModel.belongsTo(PromotionModel, {
  foreignKey: 'promotion_id',
  as: 'promotion'
});

// Promotion hasOne FlashSale (nếu cần)
PromotionModel.hasOne(Notification_promotionsModel, {
  foreignKey: 'promotion_id',
  as: 'notification_promotions'
});

/* --------- User - WithdrawRequests --------- */
UserModel.hasMany(WithdrawRequestsModel, { foreignKey: 'user_id', as: 'withdrawRequests', });
WithdrawRequestsModel.belongsTo(UserModel, { foreignKey: 'user_id', as: 'user', });

// WithdrawRequest belongsTo Order
WithdrawRequestsModel.belongsTo(OrderModel, {
  foreignKey: 'order_id',
  as: 'order',
});

// Order hasMany WithdrawRequests (nếu bạn cần dùng chiều ngược)
OrderModel.hasMany(WithdrawRequestsModel, {
  foreignKey: 'order_id',
  as: 'withdrawRequests',
});

// Mỗi bid thuộc về 1 phiên đấu giá
AuctionBidModel.belongsTo(AuctionsModel, {
  foreignKey: 'auction_id',
  as: 'auction'
});

// Một phiên đấu giá có nhiều lượt bid
AuctionsModel.hasMany(AuctionBidModel, {
  foreignKey: 'auction_id',
  as: 'bids'
});
// Mỗi bid thuộc về một user
AuctionBidModel.belongsTo(UserModel, {
  foreignKey: 'user_id',
  as: 'user'
});

// Một user có thể có nhiều bid
UserModel.hasMany(AuctionBidModel, {
  foreignKey: 'user_id',
  as: 'bids'
});
// Một biến thể sản phẩm có nhiều phiên đấu giá
ProductVariantsModel.hasMany(AuctionsModel, {
  foreignKey: 'product_variant_id',
  as: 'auctions'
});

// Một phiên đấu giá thuộc về một biến thể sản phẩm
AuctionsModel.belongsTo(ProductVariantsModel, {
  foreignKey: 'product_variant_id',
  as: 'variant'
});


module.exports = {
  UserModel,
  AddressesModel,
  NotificationModel,
  ProductModel,
  CommentModel,
  OrderModel,
  WishlistModel,
  CategoriesModel,
  CartDetailModel,
  BrandModel,
  PromotionModel,
  OrderDetailModel,
  ProductVariantsModel,
  PromotionProductModel,
  ProductAttributeModel,
  ProductVariantAttributeValueModel,
  VariantImageModel,
  CommentImageModel,
  Notification_promotionsModel,
  WithdrawRequestsModel,
  BlogCategory,
  AuctionBidModel,
  AuctionsModel
};
