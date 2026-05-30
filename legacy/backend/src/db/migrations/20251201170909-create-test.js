'use strict'
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.createTable('Tests', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },

      lessonId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'Lessons',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },

      title: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: 'Test'
      },

      timeLimit: {
        type: Sequelize.INTEGER,
        allowNull: false
      },

      passingScore: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 60
      },

      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.fn('NOW')
      },

      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.fn('NOW')
      }
    })
  },

  async down (queryInterface) {
    await queryInterface.dropTable('Tests')
  }
}
