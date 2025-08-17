const connection = require('../config/database');
const { DataTypes } = require('sequelize');

const CartDetail = connection.define('cart_details', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    user_id: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    product_variant_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        // unique: 'uniq_cart_variant'
    },
    quantity: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1
    }
}, {
    tableName: 'cart_details',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
});

module.exports = CartDetail;