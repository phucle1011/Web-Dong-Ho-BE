const express = require('express');
const router = express.Router();
const { checkJWT, isAdmin } = require('../services/authCheck');
const authenticate = require('../services/Middleware');
const upload = require('../config/middleware/upload');

const OrderController = require('../controllers/Admin/ordersController');
const categoryController = require('../controllers/Admin/categoryController');
const UserController = require('../controllers/Admin/userController');
const WishlistController = require('../controllers/Admin/wishlistController')
const promotionController = require('../controllers/Admin/promotionController');
const promotionProductsController = require('../controllers/Admin/promotionProductsController');
const ProductController = require('../controllers/Admin/productController');
const AddressController = require('../controllers/Admin/addressController');
const CartController = require('../controllers/Admin/cartsControlles');
const CommentController = require('../controllers/Admin/commentsController');
const BrandController = require('../controllers/Admin/brandsController');
const PromotionUserController = require('../controllers/Admin/promotionUserController');
const EmailController = require('../controllers/Admin/nodemailerController')
const DashboardController = require('../controllers/Admin/dashboardController');
const BlogController = require('../controllers/Admin/blogsController');
const NotificationController = require('../controllers/Admin/notificationController');
const ProductAttributeController = require('../controllers/Admin/product_attributesController');
const BlogCategoryController = require('../controllers/Admin/blogCategoryController');
const { notifyWishlistPromotions } = require('../controllers/Admin/cronJobController');
const FlashSaleController = require('../controllers/Admin/flashSaleController');
const WalletsController = require('../controllers/Admin/walletsController');
const AuctionBidController = require('../controllers/Admin/AuctionBidController');
const AuctionController = require('../controllers/Admin/auctionController');

//------------------[ ADMIN ROUTES ]------------------
router.post('/auctionBid', AuctionBidController.placeBid);



//------------------[ AUCTION ]------------------\
router.get('/auction-products', AuctionController.getAuctionProduct);
router.get('/auctions', AuctionController.get);
router.get('/auctions/:id', AuctionController.getId);
router.get('/auctions/winners/:id', AuctionController.getWinner);
router.post('/auctions', AuctionController.create);
router.put('/auctions/edit/:id', AuctionController.update);
router.delete('/auctions/delete/:id', AuctionController.delete);

//------------------[ ORDERS ]------------------\
router.get('/orders/search', OrderController.searchOrders);
router.get('/orders/track/:orderCode', OrderController.trackOrder);
router.get('/orders/export-excel', OrderController.exportExcel);
router.get('/orders/filter-by-date', OrderController.filterByDate);
router.get('/orders/list', OrderController.get);
router.get('/orders/:id', OrderController.getById);
router.put('/orders/edit/:id', OrderController.update);
router.delete("/orders/delete/:id", OrderController.delete);

//------------------[ WALLETS ]------------------\
router.get('/wallets', WalletsController.getAll);
router.put('/wallets/withdraw/:id', WalletsController.updateWithdrawStatus);
router.get('/wallets/withdraw/:id', WalletsController.getId);
router.get("/wallets/user/:userId", WalletsController.getByUserId);
router.get('/wallets/topups', checkJWT, WalletsController.getTopupHistory);

//------------------[ USERS ]------------------\
router.get('/user/list', UserController.get);
router.get('/user/search', UserController.searchUser);
router.get('/user/:id', UserController.getById);
router.put('/user/:id/status', authenticate, UserController.updateUserStatus);
router.put('/user/:id/avatar', authenticate, UserController.updateAvatar);

//------------------[ WISHLIST ]------------------\
router.get('/wishlist', WishlistController.getAllWishlists);
router.get('/users/:userId/wishlist', WishlistController.getWishlistByUser);
router.post('/wishlist', WishlistController.addToWishlist);
router.delete('/users/:userId/wishlist/:productVariantId', WishlistController.removeFromWishlist);
router.get('/wishlist/search', WishlistController.searchWishlist);
router.get('/users/:userId/wishlist/search', WishlistController.searchWishlistByUserProduct);
router.get('/wishlist/most-favorited', WishlistController.getMostFavoritedVariants);
router.get('/wishlist/recently-favorited', WishlistController.getRecentlyFavoritedVariants);


//------------------[ CATEGORY ]------------------\
router.get("/category/list", categoryController.getAll);
router.post('/category/create', categoryController.create);
router.get("/category/:id", categoryController.getById);
router.put('/category/:id', categoryController.update);
router.delete('/category/:id', categoryController.delete);

//------------------[ PROMOTIONS ]------------------\
router.get('/promotions/list', promotionController.getAll);
router.post("/promotions/create", promotionController.create);
router.get('/promotions/usage', promotionController.getPromotionUsage);
router.get('/promotions/getusers', promotionController.getHighValueBuyers);
router.get('/promotions/applied', promotionController.getAppliedPromotions);
router.get('/promotions/applied/:id', promotionController.getOrdersByPromotion);
router.get("/promotions/:id", promotionController.getById);
router.put('/promotions/:id', promotionController.update);
router.delete("/promotion/:id", promotionController.delete);
router.get('/promotions/generate-code', promotionController.generateUniquePromoCode);

//------------------[ PROMOTION PRODUCTS ]------------------\
router.get('/promotion', promotionProductsController.getAll);
router.get('/promotions/ss/all', promotionProductsController.getAllPromotion);
router.get('/promotion/:id', promotionProductsController.getById);
router.post('/promotion-products', promotionProductsController.create);
router.put('/promotion/:id', promotionProductsController.update);
router.delete('/promotions/:id', promotionProductsController.remove);

//------------------[ PRODUCT ]------------------\
router.get('/products/draft', ProductController.getDraftProducts);
router.get('/products/published', ProductController.getPublishedProducts);
router.get('/products/:id', ProductController.getById);
router.post('/products', ProductController.createProduct);
router.post('/products/:product_id/variants', ProductController.addVariant);
router.delete('/products/:id', ProductController.delete);
router.get('/products/productList/search', ProductController.searchProducts);
router.post('/variants/:variant_id/images', ProductController.addVariantImages);
router.put("/variants/:variant_id", ProductController.updateVariant);
router.put("/products/:id", ProductController.update);
router.delete('/variant-images/:image_id', ProductController.deleteSingleVariantImage);
router.get("/product-attributes", ProductController.getAllAttributes);
router.delete("/variants/:variant_id", ProductController.deleteVariant);
router.get("/variants/:variant_id", ProductController.getVariantById);
router.get('/product-variants', ProductController.getAllVariants);
router.delete('/product-variants/deleteAttributeValueById/:id', ProductController.deleteAttributeValueById);
router.post('/products/imagesClauding', ProductController.deleteImagesClauding);
router.get('/published-auction-products', ProductController.getPublishedAuctionProducts);
router.get('/product/get-category', ProductController.getAllActiveCategories);
router.get('/product/get-brand', ProductController.getAllActiveBrands);

//------------------[ ProductAttributeController ]------------------\
router.get('/attribute', ProductAttributeController.getAll);
router.post('/attribute', ProductAttributeController.create);
router.get('/attribute/:id', ProductAttributeController.getById);
router.put('/attribute/:id', ProductAttributeController.update);
router.delete('/attribute/:id', ProductAttributeController.delete);


//------------------[ ADDRESS ]------------------\
router.get('/address/list', AddressController.getAllAddress);
router.get('/address/user/:id', AddressController.getAddressesByUser);
router.delete('/user/:userId/addresses/:id', AddressController.deleteAddress);
router.put('/user/:userId/addresses/:id', AddressController.updateAddress);
router.post('/user/:userId/addresses', AddressController.addAddress);

//------------------[ CART ]------------------\
router.get('/cart/list', CartController.getAllCart);
router.get('/cart/user/:userId', CartController.getCartByUserId);


//------------------[ Blog Category ]------------------\

router.get('/blogcategory/list', BlogCategoryController.getAll);
router.get('/blogcategory/:id', BlogCategoryController.getById);
router.post('/blogcategory', BlogCategoryController.create);
router.put('/blogcategory/:id', BlogCategoryController.update);
router.delete('/blogcategory/:id', BlogCategoryController.delete);


//------------------[ Blog ]------------------\
router.get('/blog/list', BlogController.getAll);
router.get('/blog/:id', BlogController.getById);
router.post('/blog/add', BlogController.create);
router.put('/blog/:id', BlogController.update);
router.delete('/blog/:id', BlogController.delete);

//------------------[ COMMENT ]------------------\
router.get('/comment/list', CommentController.getAllComments);
router.get('/comment/product/:id', CommentController.getCommentsByProductId);
router.post('/comment/reply', CommentController.replyComment);

//------------------[ BRAND ]------------------\
router.get('/brand/list', BrandController.get);
router.get('/brand/search', BrandController.search);
router.get('/brand/active', BrandController.getActiveBrands);
router.get('/brand/inactive', BrandController.getInactiveBrands);
router.get('/brand/:id', BrandController.getById);
router.post('/brand/create', BrandController.create);
router.put('/brand/update/:id', BrandController.update);
router.delete('/brand/delete/:id', BrandController.delete);
router.put('/brand/:id/logo', BrandController.updateLogo);


//------------------[ PROMOTION-USER ]------------------\
router.get('/promotionusers/list', PromotionUserController.get);
router.post('/promotionusers/check-emails', PromotionUserController.checkPromotionExpiry);
router.post('/send-promotion-emails', EmailController.sendPromotionEmails);
router.get('/users/not-in-promotion', PromotionUserController.getUsersNotInPromotion);
router.post('/promotionusers/add', PromotionUserController.addUsersToPromotion);

//------------------[ DASHBOARD ]------------------\
router.get('/dashboard/counts', DashboardController.getCounts);
router.get('/dashboard/revenue/days', DashboardController.getRevenueByDaysInMonth);
router.get('/dashboard/revenue/months', DashboardController.getRevenueByMonthsInYear);
router.get('/dashboard/revenue', DashboardController.getRevenueByCustomRange);
router.get('/dashboard/order-status', DashboardController.getOrderStatusBreakdown);
router.get('/dashboard/promo-impact', DashboardController.getPromotionImpact);
router.get('/dashboard/top-promotions', DashboardController.getTopPromotions);
router.get('/dashboard/best-sellers', DashboardController.getTopBestSellers);

//------------------[ NOTIFICATION ]------------------\
router.get('/notification', NotificationController.getNotifications);
router.get('/notification/:id', NotificationController.getNotificationById);
router.post('/notification', NotificationController.createNotification);
router.delete('/notification/:id', NotificationController.deleteNotification);
router.patch('/notification/:id/read', NotificationController.markAsRead);
router.patch('/notification/mark-all-read', NotificationController.markAllAsRead);


router.get("/flashSale", FlashSaleController.getAll);
router.post("/flashSale", FlashSaleController.create);
router.get("/flashSale/:id", FlashSaleController.getById);
router.put("/flashSale/:id", FlashSaleController.update);
router.delete("/flashSale/:id", FlashSaleController.delete);
router.get("/active-products", FlashSaleController.getActiveProductPromotions);



module.exports = router;