import { exportGift, parseGift } from './gift';

describe('GIFT import', () => {
  it('parses the supported types, categories, titles and escapes (incl. Cyrillic)', () => {
    const src = `// коментар
$CATEGORY: $course$/Бази даних/SQL

::Q1:: Яка команда вибирає дані? {=SELECT ~INSERT ~DELETE}

Оберіть агрегатні функції {~%50%COUNT ~%50%SUM ~%-100%JOIN}

PostgreSQL — реляційна СУБД {T}

Столиця України? {=Київ =Kyiv}

Скільки байтів у кілобайті (KiB)? {#1024:0}

Число π з точністю 0\\,01 {#3.13..3.15}

Зіставте {=HTML -> розмітка =CSS -> стилі =JS -> логіка}

Опишіть нормалізацію {}

Знак рівності \\= у тексті {=так ~ні}

no answer block here
`;
    const { questions, skipped } = parseGift(src);
    expect(questions.map((q) => q.type)).toEqual([
      'SINGLE',
      'MULTIPLE',
      'TRUE_FALSE',
      'SHORT_TEXT',
      'NUMERIC',
      'NUMERIC',
      'MATCHING',
      'ESSAY',
      'SINGLE',
    ]);
    expect(questions[0]).toMatchObject({
      text: 'Яка команда вибирає дані?',
      category: 'SQL',
    });
    expect(questions[1]).toMatchObject({ partialCredit: true });
    expect(
      questions[1].answers.filter((a) => a.isCorrect).map((a) => a.text),
    ).toEqual(['COUNT', 'SUM']);
    expect(questions[3].config).toEqual({
      accepted: ['Київ', 'Kyiv'],
      caseSensitive: false,
    });
    expect(questions[5].config).toEqual({
      value: 3.14,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- asymmetric matcher
      tolerance: expect.closeTo(0.01, 5),
    });
    expect(questions[6].config).toEqual({
      pairs: [
        { left: 'HTML', right: 'розмітка' },
        { left: 'CSS', right: 'стилі' },
        { left: 'JS', right: 'логіка' },
      ],
    });
    expect(questions[8].text).toBe('Знак рівності = у тексті');
    expect(skipped).toEqual([
      expect.objectContaining({ reason: 'no answer block {…}' }),
    ]);
  });

  it('turns text after the answer block into a missing-word question', () => {
    const { questions } = parseGift(
      'Мова {=SQL ~CSS} використовується для запитів.',
    );
    expect(questions[0].text).toBe('Мова _____ використовується для запитів.');
  });

  it('round-trips through export', () => {
    const { text, skipped } = exportGift([
      {
        name: 'Основи',
        questions: [
          {
            id: 1,
            type: 'SINGLE',
            text: 'A: b?',
            partialCredit: false,
            config: null,
            answers: [
              { text: 'x=1', isCorrect: true },
              { text: 'y', isCorrect: false },
            ],
          },
          {
            id: 2,
            type: 'NUMERIC',
            text: 'n',
            partialCredit: false,
            config: { value: 2, tolerance: 0.5 },
            answers: [],
          },
          {
            id: 3,
            type: 'ORDERING',
            text: 'o',
            partialCredit: false,
            config: { items: ['a', 'b'] },
            answers: [],
          },
        ],
      },
    ]);
    expect(skipped).toBe(1);
    const back = parseGift(text).questions;
    expect(back.map((q) => q.type)).toEqual(['SINGLE', 'NUMERIC']);
    expect(back[0]).toMatchObject({ text: 'A: b?', category: 'Основи' });
    expect(back[0].answers[0].text).toBe('x=1');
  });
});
