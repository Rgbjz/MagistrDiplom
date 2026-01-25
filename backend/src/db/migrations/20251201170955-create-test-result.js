'use strict'

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

      attempt: {
        type: Sequelize.INTEGER,
        allowNull: false
      },

      startedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW')
      },

      finishedAt: {
        type: Sequelize.DATE,
        allowNull: true
      },

      score: {
        type: Sequelize.INTEGER,
        allowNull: true
      },

      passed: {
        type: Sequelize.BOOLEAN,
        allowNull: true
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
      fields: ['userId', 'testId', 'attempt'],
      type: 'unique',
      name: 'unique_user_test_attempt'
    })
  },

  async down (queryInterface) {
    await queryInterface.dropTable('TestResults')
  }
}
