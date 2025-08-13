const connection = require('../config/database');
const { DataTypes } = require('sequelize');

const ProductVariantAttributeValuesModel = connection.define('product_variant_attribute_values', {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true
        },
        product_attribute_id: {
            type: DataTypes.INTEGER,
            allowNull: true
        },
        product_variant_id: {
            type: DataTypes.INTEGER,
            allowNull: true
        },
        value: {
            type: DataTypes.STRING,
            allowNull: true
        }
    }, {
        tableName: 'product_variant_attribute_values',
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at'
    });

module.exports = ProductVariantAttributeValuesModel;