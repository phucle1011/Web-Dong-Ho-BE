const { DataTypes } = require('sequelize');
const connection = require('../config/database');

const PromotionProductModel = connection.define('promotion_products', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  promotion_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  product_variant_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },  
  variant_quantity: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: null,
  }                                            

},{
  tableName: 'promotion_products',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = PromotionProductModel;
