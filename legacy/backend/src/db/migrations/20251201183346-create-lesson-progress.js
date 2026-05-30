'use strict'
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.createTable('LessonProgresses', {
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

      status: {
        type: Sequelize.ENUM('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED'),
        allowNull: false,
        defaultValue: 'NOT_STARTED'
      },

      startedAt: {
        type: Sequelize.DATE,
        allowNull: true
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

    await queryInterface.addConstraint('LessonProgresses', {
      fields: ['userId', 'lessonId'],
      type: 'unique',
      name: 'unique_user_lesson_progress'
    })
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.dropTable('LessonProgresses')
    await queryInterface.sequelize.query(
      'DROP TYPE IF EXISTS "enum_LessonProgresses_status";'
    )
  }
}
