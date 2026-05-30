'use strict'

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.createTable('Sessions', {
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

      refreshTokenHash: {
        type: Sequelize.STRING,
        allowNull: false
      },

      userAgent: {
        type: Sequelize.STRING,
        allowNull: true
      },

      ip: {
        type: Sequelize.STRING,
        allowNull: true
      },

      expiresAt: {
        type: Sequelize.DATE,
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

    await queryInterface.addIndex('Sessions', ['refreshTokenHash'])
  },

  async down (queryInterface) {
    await queryInterface.dropTable('Sessions')
  }
}
