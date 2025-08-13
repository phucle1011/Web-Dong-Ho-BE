const connection = require('../config/database');
const { DataTypes } = require('sequelize');

const ProductVariantModel = connection.define('product_variants', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true
    },
    stock: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    sku: {
        type: DataTypes.STRING,
        allowNull: true
    },
    product_id: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    is_auction_only: {
        type: DataTypes.TINYINT,
        defaultValue: 0
    }
}, {
    tableName: 'product_variants',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
});

module.exports = ProductVariantModel;
