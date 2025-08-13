const { Op } = require("sequelize");
const Product = require("../../models/productsModel");
const ProductVariant = require("../../models/productVariantsModel");
const PromotionProduct = require("../../models/promotionProductsModel");
const Promotion = require("../../models/promotionsModel");
const ProductVariantAttributeValue = require("../../models/productVariantAttributeValuesModel");
const ProductAttribute = require("../../models/productAttributesModel");
const Brand = require('../../models/brandsModel');
const Category = require('../../models/categoriesModel');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const stringSimilarity = require("string-similarity");

const genAI = new GoogleGenerativeAI(process.env.GROQ_API_KEY);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const removeVietnameseTones = (str) => {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d").replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
};

class ChatController {
  static async chatWithGemini(req, res) {
    try {
      const { prompt, history = [] } = req.body;
      if (!prompt) return res.status(400).json({ error: "Prompt is required" });

      const normalizedPrompt = removeVietnameseTones(prompt);
      const keywords = normalizedPrompt.split(/\s|-/).filter(Boolean);

      const greetings = [
        "chao", "xin chao", "hello", "hi", "minh muon hoi",
        "co ai o do khong", "shop oi", "tu van", "giup voi"
      ];

      const isGreeting = greetings.some(g =>
        normalizedPrompt.includes(g) ||
        stringSimilarity.compareTwoStrings(normalizedPrompt, g) > 0.7
      );

      if (isGreeting) {
        return res.json({
          reply: "Xin chào bạn! Mình có thể giúp gì cho bạn hôm nay?",
          products: []
        });
      }

      // Intent detection
      const isProductIntent = ['dong ho', 'san pham'].some(kw => normalizedPrompt.includes(kw));
      const isPromotionIntent = ['khuyen mai', 'giam gia'].some(kw => normalizedPrompt.includes(kw));
      const isWarrantyIntent = ['bao hanh', 'doi tra'].some(kw => normalizedPrompt.includes(kw));
      const isShippingIntent = ['giao hang', 'van chuyen'].some(kw => normalizedPrompt.includes(kw));
      const isContactIntent = ['lien he', 'hotline', 'ho tro'].some(kw => normalizedPrompt.includes(kw));
      const isVariantIntent = ['mau sac', 'mau', 'size', 'kich thuoc', 'day da', 'day kim loai', 'kieu', 'mat so', 'kích thước', 'chất liệu dây', 'chất liệu vỏ', 'chuyển động'].some(kw =>
        normalizedPrompt.includes(kw)
      );

      if (isWarrantyIntent) {
        return res.json({
          reply: "Sản phẩm bên mình được bảo hành chính hãng 12 tháng. Bạn cần hỗ trợ thêm gì không?",
          products: []
        });
      }

      if (isShippingIntent) {
        return res.json({
          reply: "Bên mình hỗ trợ giao hàng toàn quốc, thời gian từ 2–5 ngày tùy khu vực bạn nhé.",
          products: []
        });
      }

      if (isContactIntent) {
        return res.json({
          reply: "Bạn có thể liên hệ bên mình qua số hotline 0123.456.789 hoặc email hotro@dongho.vn",
          products: [],
          action: "contact",
        });
      }

      if (!isProductIntent && !isPromotionIntent && !isVariantIntent) {
        return res.json({
          reply: "Xin lỗi bạn, mình chưa rõ yêu cầu. Bạn có thể nói cụ thể hơn không ạ?",
          products: []
        });
      }

      const matchedProducts = await Product.findAll({
        where: {
          status: 1,
          publication_status: "published",
        },
        include: [
          {
            model: ProductVariant,
            as: "variants",
            required: true,
            include: [
              {
                model: ProductVariantAttributeValue,
                as: "attributeValues",
                include: [
                  {
                    model: ProductAttribute,
                    as: "attribute",
                  }
                ]
              },
              {
                model: PromotionProduct,
                as: "promotionProducts",
                include: [
                  {
                    model: Promotion,
                    as: "promotion",
                    where: {
                      status: "active",
                      start_date: { [Op.lte]: new Date() },
                      end_date: { [Op.gte]: new Date() },
                    },
                    required: false
                  }
                ]
              }
            ]
          },
          { model: Brand, as: "brand" },
          { model: Category, as: "category" }
        ]
      });

      const scoredResults = matchedProducts
        .map(product => {
          const normName = removeVietnameseTones(product.name || "");
          const normBrand = removeVietnameseTones(product.brand?.name || "");
          const normCategory = removeVietnameseTones(product.category?.name || "");
          let score = 0;

          // Tên sản phẩm
          keywords.forEach(kw => {
            if (normName.includes(kw)) score += 3;
            else score += stringSimilarity.compareTwoStrings(normName, kw);
          });

          // Thương hiệu
          keywords.forEach(kw => {
            if (normBrand.includes(kw)) score += 2;
            else score += stringSimilarity.compareTwoStrings(normBrand, kw) * 2;
          });

          // Danh mục
          keywords.forEach(kw => {
            if (normCategory.includes(kw)) score += 2;
            else score += stringSimilarity.compareTwoStrings(normCategory, kw) * 2;
          });

          // Biến thể và thuộc tính
          const variantScore = product.variants.reduce((vScore, variant) => {
            const normVariantName = removeVietnameseTones(variant.name || "");
            let subScore = 0;

            keywords.forEach(kw => {
              if (normVariantName.includes(kw)) subScore += 1.5;
              else subScore += stringSimilarity.compareTwoStrings(normVariantName, kw);
            });

            variant.attributeValues?.forEach(attr => {
              const attrValue = removeVietnameseTones(attr?.value || "");
              const attrName = removeVietnameseTones(attr?.attribute?.name || "");
              keywords.forEach(kw => {
                if (attrValue.includes(kw) || attrName.includes(kw)) subScore += 1;
              });
            });

            return Math.max(vScore, subScore);
          }, 0);

          score += variantScore;

          return { product, score };
        })
        .filter(item => item.score > 0.5)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
        .map(({ product }) => {
          const variant = product.variants[0];
          const promo = variant?.promotionProducts?.[0]?.promotion;
          const price = parseFloat(variant?.price || 0);
          let finalPrice = price;

          if (promo) {
            if (promo.discount_type === "percentage") {
              finalPrice = price * (1 - promo.discount_value / 100);
            } else if (promo.discount_type === "fixed") {
              finalPrice = price - promo.discount_value;
            }
          }

          return {
            id: product.id,
            name: product.name,
            thumbnail: product.thumbnail,
            price,
            final_price: promo ? parseFloat(finalPrice.toFixed(2)) : null,
            promotion: promo ? {
              discount_type: promo.discount_type,
              discount_value: promo.discount_value
            } : null
          };
        });

      if (scoredResults.length > 0) {
        return res.json({
          reply: `Tôi tìm thấy ${scoredResults.length} sản phẩm phù hợp với yêu cầu của bạn.`,
          products: scoredResults
        });
      }

      // Fallback: gửi câu hỏi cho Gemini
      const knowledgeBasePath = path.join(__dirname, "../../data/knowledgeBase.txt");
      let knowledgeBase = "";

      try {
        knowledgeBase = fs.readFileSync(knowledgeBasePath, "utf8");
      } catch (err) {
        console.error("Không đọc được file knowledgeBase.txt:", err.message);
      }

      // Tạo prompt có kiến thức nền
      const vietnamesePrompt = `
Bạn là chatbot hỗ trợ khách hàng của website bán đồng hồ. Dưới đây là thông tin nội bộ về chính sách, sản phẩm và hỗ trợ khách hàng:

${knowledgeBase}

Câu hỏi của khách hàng: "${prompt}"

Hãy trả lời một cách ngắn gọn, chuyên nghiệp, lịch sự, đúng theo nội dung trên nếu có.
Nếu không có thông tin phù hợp, hãy trả lời theo cách lịch sự và trung lập.
`;
      let fallbackResult;
      let retries = 0;
      const maxRetries = 3;

      while (retries < maxRetries) {
        try {
          fallbackResult = await chatSession.sendMessage(vietnamesePrompt);
          break;
        } catch (err) {
          if (err.message.includes("503") && retries < maxRetries - 1) {
            retries++;
            console.warn(`Gemini quá tải, thử lại lần ${retries} sau 2s...`);
            await sleep(2000);
          } else {
            throw err;
          }
        }
      }

      const fallbackReply = await fallbackResult.response.text();
      return res.json({
        reply: fallbackReply || "Không có phản hồi từ Gemini.",
        products: []
      });
    } catch (error) {
      console.error("Gemini API Error:", error?.response?.data || error.message);
      res.status(500).json({
        reply: "Lỗi từ server Gemini.",
        detail: error?.response?.data || error.message,
        products: []
      });
    }
  }
}

module.exports = ChatController;
