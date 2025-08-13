require('dotenv').config();
  
const { Sequelize } = require('sequelize');

const sequelize = new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASS, {
  host: process.env.DB_HOST,
  dialect: process.env.DB_DIALECT,
  logging: console.log,
  dialectOptions: {
    // useUTC: false, 
    timezone: 'Z', 
  },
  timezone: '+07:00',
});

sequelize.authenticate()
  .then(() => console.log('Kết nối MySQL thành công!'))
  .catch(err => console.error('Lỗi kết nối:', err));

module.exports = sequelize;