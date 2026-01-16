'use strict'
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.createTable('Enrollments', {
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

      status: {
        type: Sequelize.ENUM('ACTIVE', 'PENDING', 'REJECTED', 'COMPLETED'),
        allowNull: false,
        defaultValue: 'PENDING'
      },

      enrolledAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW')
      },

      completedAt: {
        type: Sequelize.DATE,
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

    await queryInterface.addConstraint('Enrollments', {
      fields: ['userId', 'courseId'],
      type: 'unique',
      name: 'unique_user_course_enrollment'
    })
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.dropTable('Enrollments')
    await queryInterface.sequelize.query(
      'DROP TYPE IF EXISTS "enum_Enrollments_status";'
    )
  }
}
