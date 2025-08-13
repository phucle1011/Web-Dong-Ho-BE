// controllers/ChatboxController.js
const { Op } = require("sequelize");
const axios = require("axios");
require("dotenv").config();

const Product = require("../../models/productsModel");
const BrandModel = require("../../models/brandsModel");
const ProductVariant = require("../../models/productVariantsModel");
const CartDetailsModel = require("../../models/cartDetailsModel");
const PromotionsModel = require("../../models/promotionsModel");
const BlogsModel = require("../../models/blogsModel");
const WishlistsModel = require("../../models/wishlistsModel");

class ChatboxController {
  static async chatWithBot(req, res) {
    try {
      const { message, userId, history = [] } = req.body;
      const lowerMessage = message.toLowerCase().trim();

      const handlers = [
        ChatboxController.handleSuggestProduct,
        ChatboxController.handlePromotion,
        ChatboxController.handleBlog,
        ChatboxController.handleCart,
        ChatboxController.handleWishlist,
      ];

      for (const handler of handlers) {
        const reply = await handler(lowerMessage, userId, history);
        if (reply) return res.status(200).json({ reply });
      }

      const response = await axios.post(
        "https://api.groq.com/openai/v1/chat/completions",
        {
          model: "llama3-70b-8192",
          messages: [
            { role: "system", content: "Bạn là trợ lý bán hàng thân thiện, tư vấn bằng tiếng Việt." },
            ...history,
            { role: "user", content: message },
          ],
          temperature: 0.7,
        },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
          },
        }
      );

      return res.status(200).json({ reply: response.data.choices[0].message.content });
    } catch (error) {
      console.error("Chatbot Error:", error.response?.data || error.message);
      res.status(500).json({ error: "Lỗi hệ thống hoặc API." });
    }
  }

  static async handleSuggestProduct(msg, userId, history) {
    const suggestPattern = /gợi ý|tư vấn|sản phẩm|xem hàng|đồng hồ/i;
    if (!suggestPattern.test(msg)) return null;

    const brands = await BrandModel.findAll();
    const matchedBrand = brands.find(b => msg.includes(b.name.toLowerCase()));
    const brandFilter = matchedBrand?.name;

    const priceMatch = msg.match(/(?:dưới|duoi)\s*(\d+(?:[.,]?\d+)?)/i);
    const maxPrice = priceMatch ? parseInt(priceMatch[1].replace(/[.,]/g, "")) * 1000 : null;

    const whereClause = {};
    if (maxPrice) whereClause.price = { [Op.lte]: maxPrice };

    const includeClause = [
      {
        model: Product,
        as: "product",
        include: [{ model: BrandModel, as: "brand" }],
      },
    ];

    let variants = await ProductVariant.findAll({
      where: whereClause,
      include: includeClause,
      order: [["created_at", "DESC"]],
    });

    if (brandFilter) {
      variants = variants.filter(v => 
        v.product?.brand?.name?.toLowerCase() === brandFilter.toLowerCase()
      );
    }

    if (!variants.length) {
      return "Xin lỗi, tôi không tìm thấy sản phẩm phù hợp với yêu cầu của bạn.";
    }

    const productList = variants.slice(0, 5).map((v, i) => {
      const productName = v.product?.name || "Không tên";
      const brandName = v.product?.brand?.name || "Không rõ hãng";
      const price = v.price ?? "Không rõ";
      return `${i + 1}. ${productName} - ${brandName} - ${price}`;
    }).join("\n");

    const prompt = `Danh sách sản phẩm phù hợp:\n${productList}\n\nKhách hỏi: \"${msg}\". Tư vấn thân thiện, rõ ràng và ngắn gọn.`;

    const response = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "llama3-70b-8192",
        messages: [
          { role: "system", content: "Bạn là trợ lý bán hàng thân thiện, tư vấn bằng tiếng Việt." },
          ...history,
          { role: "user", content: prompt },
        ],
        temperature: 0.7,
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        },
      }
    );

    return response.data.choices[0].message.content;
  }

  static async handlePromotion(msg) {
    if (!/khuyến mãi|giảm giá|ưu đãi/i.test(msg)) return null;

    const promotions = await PromotionsModel.findAll({
      where: { end_date: { [Op.gte]: new Date() } },
      order: [["end_date", "ASC"]],
    });

    if (!promotions.length) return "Hiện tại chưa có khuyến mãi nào.";

    const list = promotions.map((p, i) => {
      const name = p.name || "Không rõ tên";
      const value = p.discount_value ?? 0;
      const unit = p.discount_type === 'percentage' ? '%' : ' VND';
      const endDate = new Date(p.end_date).toLocaleDateString("vi-VN");
      return `${i + 1}. ${name} - Giảm ${value}${unit} đến ${endDate}`;
    }).join("\n");

    return `Khuyến mãi hiện có:\n${list}`;
  }

  static async handleBlog(msg) {
    if (!/blog|bài viết|tin tức/i.test(msg)) return null;

    const blogs = await BlogsModel.findAll({
      order: [["created_at", "DESC"]],
    });

    if (!blogs.length) return "Hiện chưa có bài viết nào.";
    return `Bài viết mới nhất: ${blogs[0].title}`;
  }

  static async handleCart(msg, userId) {
    if (!userId || !/giỏ hàng|cart|đã thêm/i.test(msg)) return null;
    const cart = await CartDetailsModel.findAll({
      where: { userId },
      include: [{ model: ProductVariant, as: "variant" }],
    });
    if (!cart.length) return "Giỏ hàng của bạn đang trống.";
    return "Sản phẩm trong giỏ hàng:\n" + cart.map((c, i) => `${i + 1}. ${c.variant?.name || "Sản phẩm"} - SL: ${c.quantity}`).join("\n");
  }

  static async handleWishlist(msg, userId) {
    if (!userId || !/yêu thích|wishlist/i.test(msg)) return null;
    const wishlist = await WishlistsModel.findAll({
      where: { userId },
      include: [{ model: Product, as: "product" }],
    });
    if (!wishlist.length) return "Bạn chưa có sản phẩm yêu thích.";
    return "Danh sách yêu thích:\n" + wishlist.map((w, i) => `${i + 1}. ${w.product?.name || "Không rõ tên"}`).join("\n");
  }
}

module.exports = ChatboxController;
