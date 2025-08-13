const connection = require('../config/database');
const { DataTypes } = require('sequelize');

const VariantImagesModel = connection.define('variant_images', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    variant_id: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    image_url: {
        type: DataTypes.STRING,
        allowNull: true
    }
}, {
    tableName: 'variant_images',
    timestamps: false
});

module.exports = VariantImagesModel;