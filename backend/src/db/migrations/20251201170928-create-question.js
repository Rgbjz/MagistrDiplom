'use strict'
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.createTable('Questions', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },

      testId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'Tests',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },

      text: {
        type: Sequelize.TEXT,
        allowNull: false
      },

      type: {
        type: Sequelize.ENUM('SINGLE', 'MULTIPLE'),
        allowNull: false,
        defaultValue: 'SINGLE'
      },

      difficulty: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 1
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
    await queryInterface.dropTable('Questions')
    await queryInterface.sequelize.query(
      'DROP TYPE IF EXISTS "enum_Questions_type";'
    )
  }
}
