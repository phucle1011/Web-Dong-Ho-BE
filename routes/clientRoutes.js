const express = require('express');
const router = express.Router();
const categoryController = require('../controllers/Client/categoryController');
const ProductCompaireController = require('../controllers/Client/ProductsCompaireController');
const BlogController = require('../controllers/Client/blogsController');
const ContactController = require('../controllers/Client/contactController');
const PromotionController = require('../controllers/Client/promotionController');
const AddressController = require('../controllers/Client/addressController');
const CartController = require('../controllers/Client/cartsController');
const ProductController = require('../controllers/Client/productController');
const AuthController = require('../controllers/Client/authController');
const ProductClientController = require('../controllers/Client/productClientController');
const ProductVariantController = require('../controllers/Client/productVariantController');
const OrderController = require('../controllers/Client/ordersController');
const ClientCommentController = require('../controllers/Client/commentsController');
const  chatWithBot  = require('../controllers/Client/chatboxController');
const ShippingController = require('../controllers/Client/shippingController');
const WishlistController = require('../controllers/Client/wishlistController');
const BrandController = require('../controllers/Client/brandController');
const { checkJWT } = require('../services/authCheck');
const multer = require('multer');
const storage = multer.memoryStorage();
const upload = multer({ storage });
const { changePassword } = require('../controllers/Client/PasswordOldController');
const authenticate = require('../services/Middleware'); 
const brandClientController = require('../controllers/Client/brandClientController');
const ProfileController = require('../controllers/Client/ProfileController');
const HomeController = require('../controllers/Client/HomeController');
const UserController = require('../controllers/Client/userControllers');
const reviewController = require('../controllers/Client/reviewController');
const notificationClientController = require('../controllers/Client/notificationClientController');
const SearchController = require('../controllers/Client/SearchController')
const FlashSaleController = require('../controllers/Client/flashSaleController');
const WalletsController = require('../controllers/Client/walletsController');
const AuctionController = require('../controllers/Client/auctionsController');
const AuctionBidController = require('../controllers/Client/AuctionBidController');

//------------------[ CLIENT ROUTES ]------------------

//------------------[ AUCTION ]------------------
router.get('/auctions/balance', checkJWT, AuctionController.getBalance);
router.post('/auctions/entry-otp', checkJWT, AuctionController.requestEntryOTP);
router.post('/auctions/entry-otp/verify', checkJWT, AuctionController.verifyEntryOTP);
router.get('/auctions', AuctionController.get);
router.get('/auctions/:auctionId/bids', AuctionController.getBids);
router.post('/auctions/:auctionId/bids', checkJWT, AuctionController.placeBid);

//------------------[ HOME]------------------
router.get("/products/getallnew", HomeController.getAllNewProducts);
router.get("/top-sold-products", HomeController.getTopSoldProducts);
router.get("/top-discounted-products", HomeController.getDiscountedProducts);

//------------------[ Wallets ]------------------
router.get('/wallets', checkJWT, WalletsController.get);
router.post('/wallets/transactions', checkJWT, WalletsController.requestWithdraw);
router.get('/wallets/topups', checkJWT, WalletsController.getTopupHistory);
router.post('/wallets/deduct-fee', checkJWT, WalletsController.deductFee);

// ------------------[ SEARCH ]------------------//
router.get('/products/search', SearchController.searchProducts);
router.get('/attribute-values', SearchController.getAttributeValues);
router.get('/product-attributes',   SearchController.getProductAttributes);


//------------------[ CHATBOX ]------------------//
router.post("/chatbox",chatWithBot.chatWithBot);

//------------------[ PRODUCTS ]------------------
router.get('/products/:id/variants', ProductController.getNonAuctionVariantsWithPromotion);
router.get('/products/:id/auction-variants', ProductController.getAuctionVariants);

router.get('/products/:id/similar', ProductController.getSimilarProducts);

//------------------[ CATEGORY ]------------------
router.get("/category/list", categoryController.getCategories);

//------------------[ Blogs ]------------------        
router.post("/blogs/:id/view", BlogController.trackView);     
router.get("/blogs/hot", BlogController.getHot);             
router.get("/blogs/search", BlogController.searchBlogs);
router.get("/blogs/:id", BlogController.getBlogById);
router.get("/blogs", BlogController.getAllBlogs);

//------------------[ Contact ]------------------
router.post("/contact", ContactController.sendContactEmail);
router.post("/contact/faq", ContactController.sendFaqEmail);

//------------------[ Promotions ]------------------
router.post('/promotions/apply',checkJWT, PromotionController.applyDiscount);
router.get('/promotions/active',checkJWT, PromotionController.getActivePromotions);

//------------------[ Products Compaire ]------------------
router.get("/products/compare", ProductCompaireController.getAllForComparison);

//------------------[ ADDRESS ]------------------\
router.get('/address/user/:id', AddressController.getAddressesByUser);
router.delete('/user/:userId/addresses/:id', AddressController.deleteAddress);
router.put('/user/:userId/addresses/:id', AddressController.updateAddress);
router.post('/user/:userId/addresses', AddressController.addAddress);

//------------------[ CARTS ]------------------
router.get("/carts", checkJWT, CartController.getCartByUser);
router.post("/add-to-carts", checkJWT, CartController.addToCart);
router.put("/update-to-carts/:productVariantId", checkJWT, CartController.updateCartItem);
router.delete("/delete-to-carts/:productVariantId", checkJWT, CartController.removeCartItem);
router.delete("/clear-cart", checkJWT, CartController.clearCartByUser);

//------------------[ ORDERS ]------------------
router.get("/orders", checkJWT, OrderController.get);
router.post("/orders", OrderController.create);
router.post("/orders-momo", OrderController.createMomoUrl);
router.post("/payment-notification", OrderController.momoPaymentNotification);
router.post("/orders-vnpay", OrderController.createVNPayUrl);
router.get("/vnpay-callback", OrderController.handleVNPayCallback);
router.put("/orders/cancel/:id", OrderController.cancelOrder);
router.put("/orders/confirm-delivered/:id", OrderController.confirmDelivered);
router.post('/wallets/request-refund', checkJWT, OrderController.requestRefund);
router.get('/wallet/balance', checkJWT, OrderController.getBalance);
router.get('/coin', checkJWT, OrderController.getCoin);
router.post('/wallet/topup', checkJWT, OrderController.createStripeTopupSession);

//------------------[ SHIPPING ]------------------
router.post('/shipping/shipping-fee', ShippingController.calculateShippingFee);

//------------------[ AUTH ]------------------\
router.post('/auth/register', AuthController.register);
router.get('/auth/verify-email', AuthController.verifyEmail);
router.post('/auth/login', AuthController.login);
router.post('/auth/google', AuthController.googleLogin);
router.post('/auth/check-token', AuthController.checkToken);
router.post('/auth/update-verification', AuthController.updateVerification);
router.post('/auth/reset-password', AuthController.resetPassword);
router.post('/auth/update-password/:token', AuthController.updatePassword);
router.get('/users/:id', AuthController.getById);
router.put('/users/:id', AuthController.update);

router.get("/profile/order-stats/:id", ProfileController.getOrderStats);
router.get("/profile/new-orders/:id", ProfileController.getTotalNewOrders);

//------------------[ PRODUCTS ]------------------//
router.get('/products', ProductClientController.getAll);

router.get('/price-range', ProductClientController.getPrice);

// router.get('/stock', ProductClientController.countStockGroupByProductId);
// router.get('/:id', ProductVariantController.getProductVariantDetail);

router.get('/product-variants/:id', ProductVariantController.getProductVariantDetail);
router.get('/products/discounted', ProductVariantController.getDiscountedProducts);

// ------------------[ Comment ]------------------//
router.post('/comments', ClientCommentController.addComment);
router.get('/comment/product/:id', ClientCommentController.getCommentsByProductId);
router.put("/comments/:id", ClientCommentController.updateComment);

// ------------------[ Wishlist ]------------------//
router.get('/wishlist', WishlistController.getAllWishlists);
router.get('/users/:userId/wishlist', WishlistController.getWishlistByUser);
router.post('/wishlist', WishlistController.addToWishlist);
router.delete('/users/:userId/wishlist/:productVariantId', WishlistController.removeFromWishlist);
router.delete('/users/:userId/wishlist', WishlistController.clearWishlist);
router.post('/users/:userId/wishlist/add-to-cart', WishlistController.addWishlistToCart);
router.post('/wishlist/add-single-to-cart', WishlistController.addSingleWishlistItemToCart);

// ------------------[ PasswordOld ]------------------//
router.post('/change-password', authenticate, changePassword);

//------------------[ BRANDS ]------------------
router.get('/brands/active', BrandController.getActiveBrands);
router.get('/brands/search', BrandController.search);
router.get('/brand/list', brandClientController.getAll);
router.get('/brands/get-products-by-brands', BrandController.getProductsByBrands);
router.get("/brands/top", BrandController.getTopBrands);


//------------------[ USERS ]------------------
router.put('/users/:id', UserController.updateUserInfo);
router.get('/fail-me', authenticate, UserController.getMe);

//------------------[ Reviews ]------------------
router.get('/:userId/reviews', reviewController.getAllReviews);

//------------------[ Notifications ]------------------
router.get('/notifications', notificationClientController.getNotifications);
router.patch('/notifications/:id/read', notificationClientController.getNotificationById);
router.patch('/notifications/mark-all-read', notificationClientController.createNotification);

router.get('/client/flashSale', FlashSaleController.getAll);
router.get('/client/flashSale/list/:notification_id', FlashSaleController.getDiscountedProductsByNotificationId);

//------------------[ AuctionBidController ]------------------
 router.post('/placeBid', AuctionBidController.placeBid);

module.exports = router;