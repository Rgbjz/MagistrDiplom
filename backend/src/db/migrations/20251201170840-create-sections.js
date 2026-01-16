'use strict'
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.createTable('Sections', {
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

      order: {
        type: Sequelize.INTEGER,
        allowNull: false
      },

      courseId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'Courses',
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

    await queryInterface.addConstraint('Sections', {
      fields: ['courseId', 'order'],
      type: 'unique',
      name: 'unique_section_order_per_course'
    })
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.dropTable('Sections')
  }
}
