const connection = require('../config/database');
const { DataTypes } = require('sequelize');

const ProductAttributeModel = connection.define('product_attributes', {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true
        },
        name: {
            type: DataTypes.STRING,
            allowNull: true
        }
    }, {
        tableName: 'product_attributes',
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at'
    });

module.exports = ProductAttributeModel;