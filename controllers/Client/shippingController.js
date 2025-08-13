const axios = require('axios');

const API_TOKEN = '1f73c4c8-3184-11f0-b930-ca8d03ab5418';
const SHOP_ID = '5778611';

class ShippingController {

  static async calculateShippingFee(req, res) {
    try {
      const {
        from_district_id,
        from_ward_code,
        to_district_id,
        to_ward_code,
        service_id,
        weight,
        length,
        width,
        height
      } = req.body;

      if (!from_district_id || !to_district_id || !service_id || !weight) {
        return res.status(400).json({
          success: false,
          message: 'Thiếu thông tin bắt buộc'
        });
      }

      const response = await axios.post(
        'https://online-gateway.ghn.vn/shiip/public-api/v2/shipping-order/fee',
        {
          from_district_id: Number(from_district_id),
          from_ward_code,
          to_district_id: Number(to_district_id),
          to_ward_code,
          service_id: Number(service_id),
          weight: Number(weight),
          length: Number(length) || 20,
          width: Number(width) || 15,
          height: Number(height) || 10,
          insurance_value: 0
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Token': API_TOKEN,
            'ShopId': SHOP_ID
          }
        }
      );

      if (response.data.code !== 200) {
        return res.status(400).json({
          success: false,
          message: response.data.message || 'Lỗi tính phí vận chuyển',
          data: null
        });
      }

      res.json({
        success: true,
        data: {
          total: response.data.data.total,
          service_fee: response.data.data.service_fee,
          insurance_fee: response.data.data.insurance_fee
        }
      });

    } catch (error) {
      // console.error('Lỗi API GHN:', error.response?.data || error.message);
      if (error.response?.data?.message?.includes('route not found')) {
        return res.status(400).json({
          success: false,
          message: 'Không hỗ trợ dịch vụ này cho tuyến đường',
          data: null
        });
      }

      res.status(500).json({
        success: false,
        message: 'Lỗi hệ thống',
        error: error.message
      });
    }
  }

}

module.exports = ShippingController;
