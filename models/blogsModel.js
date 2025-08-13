const connection = require('../config/database');
const { DataTypes } = require('sequelize');

const Blog = connection.define('Blog', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  title: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  image_url: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
  updated_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
  meta_description: {
    type: DataTypes.STRING(1000),
    allowNull: true,
  },
  blogCategory_id: { 
    type: DataTypes.INTEGER,
    allowNull: false ,
  },
  view_count: {
  type: DataTypes.INTEGER,
  allowNull: false,
  defaultValue: 0
},



}, {
  tableName: 'blogs',
  timestamps: false,
});

module.exports = Blog;
