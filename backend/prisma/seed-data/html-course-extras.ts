// Labs and tests for the «HTML з нуля (відеокурс)» course. Used by
// prisma/seed.ts locally; the same data was created on production via the API.

export type ExtraQuestion =
  | {
      text: string;
      type: 'SINGLE' | 'MULTIPLE';
      answers: [string, boolean][];
      points?: number;
    }
  | {
      text: string;
      type: 'TRUE_FALSE' | 'SHORT_TEXT' | 'ORDERING' | 'MATCHING';
      config: Record<string, unknown>;
      points?: number;
      partialCredit?: boolean;
    };

export type ExtraTest = {
  lessonTitle: string;
  title: string;
  /** Minutes. */
  timeLimit: number;
  questions: ExtraQuestion[];
};

export type ExtraAssignment = {
  lessonTitle: string;
  title: string;
  description: string;
  dueInDays: number;
  maxScore: number;
  maxFiles: number;
};

const criteria = (rows: [string, number][]) =>
  '<h3>Критерії оцінювання</h3><ul>' +
  rows.map(([text, points]) => `<li>${text} — ${points} б.</li>`).join('') +
  '</ul>';

export const HTML_LABS: ExtraAssignment[] = [
  {
    lessonTitle: 'Коментарі в HTML. Метадані meta',
    title: 'Лабораторна робота 1. Перша HTML-сторінка',
    dueInDays: 7,
    maxScore: 10,
    maxFiles: 3,
    description:
      '<p><strong>Мета:</strong> навчитися створювати коректний HTML5-документ і заповнювати його метадані.</p>' +
      '<h3>Завдання</h3><ol>' +
      '<li>Створіть файл <code>index.html</code> з оголошенням <code>&lt;!DOCTYPE html&gt;</code> і атрибутом <code>lang="uk"</code>.</li>' +
      '<li>У <code>&lt;head&gt;</code> додайте кодування UTF-8, тег <code>viewport</code>, змістовний <code>&lt;title&gt;</code> і <code>description</code>.</li>' +
      '<li>У <code>&lt;body&gt;</code> розмістіть заголовок <code>&lt;h1&gt;</code> з вашим ім’ям і два абзаци про себе.</li>' +
      '<li>Додайте щонайменше три коментарі, що пояснюють структуру документа.</li>' +
      '<li>Відкрийте сторінку в браузері та зробіть скриншот.</li>' +
      '</ol>' +
      '<h3>Що здати</h3><p>Файл <code>index.html</code> і скриншот сторінки (PNG або JPG).</p>' +
      criteria([
        ['Правильна структура документа (doctype, html, head, body)', 3],
        ['Метадані: charset, viewport, title, description', 3],
        ['Вміст сторінки: заголовок і абзаци', 2],
        ['Коментарі та охайне форматування коду', 2],
      ]),
  },
  {
    lessonTitle: 'Що таке атрибути HTML?',
    title: 'Лабораторна робота 2. Сторінка-резюме',
    dueInDays: 14,
    maxScore: 10,
    maxFiles: 3,
    description:
      '<p><strong>Мета:</strong> закріпити теги для роботи з текстом, списками й атрибутами.</p>' +
      '<h3>Завдання</h3><ol>' +
      '<li>Зверстайте сторінку-резюме: ім’я (<code>&lt;h1&gt;</code>), розділи «Про мене», «Навички», «Освіта», «Досвід» (<code>&lt;h2&gt;</code>).</li>' +
      '<li>Навички оформіть маркованим списком, освіту й досвід — нумерованим; хоча б один список має бути вкладеним.</li>' +
      '<li>Використайте <code>&lt;strong&gt;</code>, <code>&lt;em&gt;</code>, <code>&lt;br&gt;</code> і <code>&lt;hr&gt;</code> за призначенням.</li>' +
      '<li>Додайте атрибути <code>title</code> і <code>id</code> до розділів, щоб на них можна було послатися.</li>' +
      '</ol>' +
      '<h3>Що здати</h3><p>Файл <code>resume.html</code> і скриншот сторінки.</p>' +
      criteria([
        ['Ієрархія заголовків h1–h2 без пропусків рівнів', 2],
        ['Марковані, нумеровані та вкладений списки', 3],
        ['Теги виділення тексту використано за змістом', 2],
        ['Атрибути id і title на розділах', 2],
        ['Валідний код без помилок у валідаторі W3C', 1],
      ]),
  },
  {
    lessonTitle: 'Створення HTML-таблиць',
    title: 'Лабораторна робота 3. Міні-сайт: посилання, зображення, таблиця',
    dueInDays: 21,
    maxScore: 15,
    maxFiles: 5,
    description:
      '<p><strong>Мета:</strong> навчитися пов’язувати сторінки посиланнями, вставляти зображення й будувати таблиці.</p>' +
      '<h3>Завдання</h3><ol>' +
      '<li>Створіть дві сторінки: <code>index.html</code> (головна) і <code>schedule.html</code> (розклад занять).</li>' +
      '<li>На обох сторінках зробіть однакове меню з посиланнями одна на одну; зовнішнє посилання відкривайте в новій вкладці.</li>' +
      '<li>На головній додайте 2–3 зображення з текстом у <code>alt</code> і підписами <code>&lt;figure&gt;</code>/<code>&lt;figcaption&gt;</code>.</li>' +
      '<li>На сторінці розкладу зверстайте таблицю з <code>&lt;thead&gt;</code>, <code>&lt;tbody&gt;</code>, <code>&lt;caption&gt;</code> і хоча б одним об’єднанням клітинок (<code>colspan</code> або <code>rowspan</code>).</li>' +
      '<li>Додайте посилання-якір «Нагору», що веде до початку сторінки.</li>' +
      '</ol>' +
      '<h3>Що здати</h3><p>Архів ZIP із сайтом (HTML-файли та зображення) або окремі файли, плюс скриншот таблиці.</p>' +
      criteria([
        ['Навігація між сторінками і зовнішнє посилання', 3],
        ['Зображення з alt, figure і figcaption', 3],
        ['Таблиця: thead, tbody, caption', 4],
        ['Об’єднання клітинок colspan/rowspan', 3],
        ['Якір «Нагору» та відносні шляхи до файлів', 2],
      ]),
  },
  {
    lessonTitle: 'Селектори вибору інформації',
    title: 'Лабораторна робота 4. Форма реєстрації на курс',
    dueInDays: 28,
    maxScore: 15,
    maxFiles: 3,
    description:
      '<p><strong>Мета:</strong> навчитися будувати доступні HTML-форми з різними типами полів.</p>' +
      '<h3>Завдання</h3><ol>' +
      '<li>Зверстайте форму реєстрації на курс: ім’я, email, телефон, пароль, дата народження.</li>' +
      '<li>Додайте випадний список <code>&lt;select&gt;</code> з вибором курсу, перемикачі <code>radio</code> для формату (онлайн / офлайн) і прапорці <code>checkbox</code> для зручних днів.</li>' +
      '<li>Додайте поле <code>&lt;textarea&gt;</code> для коментаря та кнопки «Надіслати» й «Очистити».</li>' +
      '<li>Кожне поле підпишіть через <code>&lt;label for&gt;</code>; обов’язкові поля позначте атрибутом <code>required</code>.</li>' +
      '<li>Згрупуйте пов’язані поля через <code>&lt;fieldset&gt;</code> і <code>&lt;legend&gt;</code>, макет зберіть на <code>&lt;div&gt;</code>.</li>' +
      '</ol>' +
      '<h3>Що здати</h3><p>Файл <code>form.html</code> і скриншот форми з показаною помилкою незаповненого обов’язкового поля.</p>' +
      criteria([
        ['Правильні типи input для кожного поля', 4],
        ['select, radio і checkbox з однаковими name у групах', 4],
        ['Підписи label for та атрибут required', 4],
        ['fieldset/legend і акуратний макет', 3],
      ]),
  },
];

export const HTML_TESTS: ExtraTest[] = [
  {
    lessonTitle: 'Як створюються сайти? Код чужого проєкту',
    title: 'Тест: основи HTML',
    timeLimit: 10,
    questions: [
      {
        text: 'Що означає абревіатура HTML?',
        type: 'SINGLE',
        answers: [
          ['HyperText Markup Language', true],
          ['HighText Machine Language', false],
          ['Hyperlink Transfer Markup Language', false],
          ['Home Tool Markup Language', false],
        ],
      },
      {
        text: 'Який рядок має стояти першим у HTML5-документі?',
        type: 'SINGLE',
        answers: [
          ['<!DOCTYPE html>', true],
          ['<html lang="uk">', false],
          ['<head>', false],
          ['<meta charset="UTF-8">', false],
        ],
      },
      {
        text: 'Які теги розміщують усередині <head>?',
        type: 'MULTIPLE',
        answers: [
          ['<title>', true],
          ['<meta>', true],
          ['<link>', true],
          ['<h1>', false],
          ['<p>', false],
        ],
      },
      {
        text: 'Текст усередині HTML-коментаря <!-- … --> відображається на сторінці.',
        type: 'TRUE_FALSE',
        config: { correct: false },
      },
      {
        text: 'Як зазвичай називається файл головної сторінки, який сервер віддає за замовчуванням?',
        type: 'SHORT_TEXT',
        config: { accepted: ['index.html'], caseSensitive: false },
      },
      {
        text: 'Який атрибут тегу <meta> задає кодування сторінки?',
        type: 'SINGLE',
        answers: [
          ['charset', true],
          ['lang', false],
          ['encoding', false],
          ['type', false],
        ],
      },
    ],
  },
  {
    lessonTitle: 'Робота із зображеннями',
    title: 'Тест: текст, списки, посилання й зображення',
    timeLimit: 15,
    questions: [
      {
        text: 'Який тег створює нумерований список?',
        type: 'SINGLE',
        answers: [
          ['<ol>', true],
          ['<ul>', false],
          ['<li>', false],
          ['<dl>', false],
        ],
      },
      {
        text: 'Які теги додають тексту смисловий (логічний) наголос?',
        type: 'MULTIPLE',
        answers: [
          ['<strong>', true],
          ['<em>', true],
          ['<b>', false],
          ['<i>', false],
        ],
      },
      {
        text: 'Який атрибут посилання відкриває його в новій вкладці?',
        type: 'SINGLE',
        answers: [
          ['target="_blank"', true],
          ['rel="new"', false],
          ['href="_blank"', false],
          ['open="tab"', false],
        ],
      },
      {
        text: 'Який атрибут тегу <img> містить текстову альтернативу зображення?',
        type: 'SHORT_TEXT',
        config: { accepted: ['alt'], caseSensitive: false },
      },
      {
        text: 'Тег <img> одиночний і не має закривального тегу.',
        type: 'TRUE_FALSE',
        config: { correct: true },
      },
      {
        text: 'Зіставте тег і його призначення.',
        type: 'MATCHING',
        points: 2,
        partialCredit: true,
        config: {
          pairs: [
            { left: '<a>', right: 'посилання' },
            { left: '<img>', right: 'зображення' },
            { left: '<li>', right: 'елемент списку' },
            { left: '<h1>', right: 'заголовок першого рівня' },
          ],
        },
      },
    ],
  },
  {
    lessonTitle: 'Поле для тексту й кнопки',
    title: 'Тест: HTML-форми',
    timeLimit: 15,
    questions: [
      {
        text: 'Який атрибут тегу <form> вказує адресу, куди надсилаються дані?',
        type: 'SINGLE',
        answers: [
          ['action', true],
          ['method', false],
          ['target', false],
          ['name', false],
        ],
      },
      {
        text: 'Які значення атрибута type коректні для тегу <input>?',
        type: 'MULTIPLE',
        answers: [
          ['email', true],
          ['password', true],
          ['checkbox', true],
          ['textarea', false],
          ['select', false],
        ],
      },
      {
        text: 'Як правильно пов’язати <label> із полем введення?',
        type: 'SINGLE',
        answers: [
          ['Атрибут for у label зі значенням id поля', true],
          ['Атрибут name у label зі значенням name поля', false],
          ['Атрибут link у полі введення', false],
          [
            'Розмістити label одразу після поля — зв’язок створиться сам',
            false,
          ],
        ],
      },
      {
        text: 'Кілька перемикачів type="radio" з однаковим name дозволяють вибрати лише один варіант.',
        type: 'TRUE_FALSE',
        config: { correct: true },
      },
      {
        text: 'Розташуйте теги випадного списку від зовнішнього до внутрішнього.',
        type: 'ORDERING',
        points: 2,
        partialCredit: true,
        config: { items: ['<form>', '<select>', '<option>'] },
      },
      {
        text: 'Який атрибут робить поле обов’язковим для заповнення?',
        type: 'SHORT_TEXT',
        config: { accepted: ['required'], caseSensitive: false },
      },
    ],
  },
];
