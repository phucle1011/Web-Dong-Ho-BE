const connection = require('../config/database');
const { DataTypes } = require('sequelize');
const PromotionModel = require('../models/promotionsModel');

const PromotionUserModel = connection.define('promotion_user', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  promotion_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  email_sent: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  used: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
}, {
  tableName: 'promotion_users',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

PromotionUserModel.belongsTo(PromotionModel, {
  foreignKey: 'promotion_id',
  as: 'promotion'
});


module.exports = PromotionUserModel;
