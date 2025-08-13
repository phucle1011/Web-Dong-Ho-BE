const connection = require('../config/database');
const { DataTypes } = require('sequelize');

const OrderModel = connection.define('orders', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    user_id: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    promotion_id: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    promotion_user_id: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    total_price: {
        type: DataTypes.DECIMAL(20, 2),
        allowNull: true
    },
    status: {
        type: DataTypes.ENUM('pending', 'confirmed', 'shipping', 'completed', 'delivered', 'cancelled'),
        allowNull: false,
        defaultValue: 'pending'
    },
    payment_method: {
        type: DataTypes.ENUM('COD', 'VnPay', 'Momo'),
        allowNull: true
    },
    cancellation_reason: {
        type: DataTypes.STRING,
        allowNull: true
    },
    shipping_fee: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false
    },
    order_code: {
        type: DataTypes.STRING,
        allowNull: false
    },
    shipping_address: {
        type: DataTypes.TEXT,
        allowNull: false
    },
    note: {
        type: DataTypes.TEXT,
        allowNull: false
    },
    discount_amount: {
        type: DataTypes.DECIMAL(20, 2),
        allowNull: true
    },
    special_discount_amount: {
        type: DataTypes.DECIMAL(20, 2),
        allowNull: true
    },
    wallet_balance: {
        type: DataTypes.DECIMAL(20, 2),
        allowNull: true
    },
}, {
    tableName: 'orders',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
});

module.exports = OrderModel;