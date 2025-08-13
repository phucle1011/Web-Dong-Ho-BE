const connection = require('../config/database');
const { DataTypes } = require('sequelize');

const CommentImagesModel = connection.define('comment_images', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    comment_id: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    image_url: {
        type: DataTypes.STRING,
        allowNull: true
    }
}, {
    tableName: 'comment_images',
    timestamps: false 
});

module.exports = CommentImagesModel;