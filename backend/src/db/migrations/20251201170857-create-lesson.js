'use strict'
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.createTable('Lessons', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },

      title: {
        type: Sequelize.STRING,
        allowNull: false
      },

      content: {
        type: Sequelize.TEXT,
        allowNull: true
      },

      videoUrl: {
        type: Sequelize.STRING,
        allowNull: true
      },

      order: {
        type: Sequelize.INTEGER,
        allowNull: false
      },

      sectionId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'Sections',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
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

    await queryInterface.addConstraint('Lessons', {
      fields: ['sectionId', 'order'],
      type: 'unique',
      name: 'unique_lesson_order_per_section'
    })
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.dropTable('Lessons')
  }
}
