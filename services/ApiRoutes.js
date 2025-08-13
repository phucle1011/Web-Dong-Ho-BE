const axios = require('axios');
const API_TOKEN = "e0c711d8-e3a7-11ef-9022-7e9c01851c55";

const fetchData = async (url, res) => {
  try {
    const response = await axios.get(url, {
      headers: { "Token": API_TOKEN }
    });
    const data = response.data;

    if (data.code === 200) {
      return data.data;
    } else {
      res.status(data.code).json({
        message: 'Lỗi khi lấy dữ liệu',
        details: data.message
      });
      return null;
    }
  } catch (error) {
    res.status(500).json({
      message: 'Có lỗi xảy ra khi kết nối đến API.',
      details: error.message
    });
    return null;
  }
};

exports.getProvinces = async (req, res) => {
  const data = await fetchData("https://online-gateway.ghn.vn/shiip/public-api/master-data/province", res);
  if (data) {
    res.json(data);
  }
};

exports.getDistricts = async (req, res) => {
  const provinceID = req.query.provinceId;
  if (!provinceID) {
    return res.status(400).json({
      message: 'ProvinceID là bắt buộc!',
      details: 'Thiếu provinceID trong yêu cầu.'
    });
  }

  const data = await fetchData(`https://online-gateway.ghn.vn/shiip/public-api/master-data/district?province_id=${provinceID}`, res);
  if (data) {
    res.json(data);
  }
};

exports.getWards = async (req, res) => {
  const districtID = req.query.districtId;  
  if (!districtID) {
    return res.status(400).json({ message: 'Thiếu district_id' });
  }

  const data = await fetchData(`https://online-gateway.ghn.vn/shiip/public-api/master-data/ward?district_id=${districtID}`, res);
  if (data) {
    res.json(data);
  }
};
