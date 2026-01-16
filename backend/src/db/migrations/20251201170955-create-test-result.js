'use strict'
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.createTable('TestResults', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },

      userId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'Users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
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

      score: {
        type: Sequelize.INTEGER,
        allowNull: false
      },

      passed: {
        type: Sequelize.BOOLEAN,
        allowNull: false
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

    await queryInterface.addConstraint('TestResults', {
      fields: ['userId', 'testId'],
      type: 'unique',
      name: 'unique_user_test_result'
    })
  },

  async down (queryInterface) {
    await queryInterface.dropTable('TestResults')
  }
}
