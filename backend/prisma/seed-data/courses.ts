// Demo course content for prisma/seed.ts. Lesson bodies are plain, safe HTML.

export type QuizQuestion = {
  text: string
  type: 'SINGLE' | 'MULTIPLE'
  answers: [string, boolean][]
}

export type LessonDef = {
  title: string
  content: string
  test?: { title: string; timeLimit: number; questions: QuizQuestion[] }
}

export type SectionDef = { title: string; lessons: LessonDef[] }

export type CourseDef = {
  key: 'web' | 'ts' | 'sql' | 'ux' | 'git' | 'english' | 'algo'
  title: string
  description: string
  category: string
  level: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED'
  price: number
  autoApprove: boolean
  published: boolean
  teacher: 'teacher1' | 'teacher2'
  sections: SectionDef[]
}

export const COURSES: CourseDef[] = [
  // ───────────────────────────── Основи веб-розробки ─────────────────────────────
  {
    key: 'web',
    title: 'Основи веб-розробки',
    description:
      'Як працює веб, HTML-розмітка, CSS-верстка на Flexbox і Grid та перші кроки в JavaScript. Курс для тих, хто починає з нуля.',
    category: 'Програмування',
    level: 'BEGINNER',
    price: 0,
    autoApprove: true,
    published: true,
    teacher: 'teacher1',
    sections: [
      {
        title: 'Як працює веб',
        lessons: [
          {
            title: 'Клієнт, сервер і HTTP',
            content: `<h2>Що відбувається, коли ви відкриваєте сайт</h2>
<p>Браузер — це <strong>клієнт</strong>. Коли ви вводите адресу, він спершу через DNS дізнається IP-адресу сервера, а потім надсилає йому <strong>HTTP-запит</strong>. Сервер повертає <strong>відповідь</strong>: код статусу, заголовки та тіло (наприклад, HTML-сторінку).</p>
<h2>Методи HTTP</h2>
<ul>
<li><strong>GET</strong> — отримати ресурс, не змінюючи його.</li>
<li><strong>POST</strong> — створити ресурс або надіслати дані форми.</li>
<li><strong>PUT / PATCH</strong> — замінити або частково оновити ресурс.</li>
<li><strong>DELETE</strong> — видалити ресурс.</li>
</ul>
<h2>Коди статусу</h2>
<p>Перша цифра коду підказує групу: <code>2xx</code> — успіх (200 OK, 201 Created), <code>3xx</code> — перенаправлення, <code>4xx</code> — помилка клієнта (404 Not Found, 403 Forbidden), <code>5xx</code> — помилка сервера.</p>
<p>Сучасні сайти працюють через <strong>HTTPS</strong> — той самий HTTP, але трафік зашифровано за допомогою TLS, тому сторонні не можуть прочитати чи підмінити дані.</p>
<p>Відкрийте інструменти розробника в браузері (F12), вкладку «Network», і перезавантажте сторінку — ви побачите кожен запит, його метод, код статусу та час виконання.</p>`,
          },
          {
            title: 'Структура HTML-документа',
            content: `<h2>Скелет сторінки</h2>
<pre><code>&lt;!doctype html&gt;
&lt;html lang="uk"&gt;
  &lt;head&gt;
    &lt;meta charset="utf-8"&gt;
    &lt;title&gt;Моя сторінка&lt;/title&gt;
  &lt;/head&gt;
  &lt;body&gt;
    &lt;h1&gt;Привіт!&lt;/h1&gt;
  &lt;/body&gt;
&lt;/html&gt;</code></pre>
<p>У <code>&lt;head&gt;</code> лежить службова інформація: кодування, заголовок вкладки, підключення стилів. У <code>&lt;body&gt;</code> — усе, що бачить користувач.</p>
<h2>Семантичні теги</h2>
<p>Замість безлічі <code>&lt;div&gt;</code> використовуйте теги, що описують зміст: <code>&lt;header&gt;</code>, <code>&lt;nav&gt;</code>, <code>&lt;main&gt;</code>, <code>&lt;article&gt;</code>, <code>&lt;footer&gt;</code>. Це допомагає скрінрідерам, пошуковим системам і вам самим через пів року.</p>
<h2>Доступність з першого рядка</h2>
<ul>
<li>Кожне зображення отримує атрибут <code>alt</code> з описом.</li>
<li>Поле форми пов'язане з <code>&lt;label&gt;</code>.</li>
<li>Кнопка — це <code>&lt;button&gt;</code>, а не клікабельний <code>&lt;div&gt;</code>.</li>
<li>Заголовки йдуть по порядку: один <code>&lt;h1&gt;</code>, далі <code>&lt;h2&gt;</code>.</li>
</ul>
<p>Атрибут <code>lang</code> на тезі <code>&lt;html&gt;</code> підказує браузеру мову сторінки — від нього залежить вимова скрінрідера та перенесення слів.</p>`,
            test: {
              title: 'Тест: як працює веб',
              timeLimit: 10,
              questions: [
                {
                  text: 'Який метод HTTP використовують, щоб отримати сторінку без зміни даних?',
                  type: 'SINGLE',
                  answers: [['GET', true], ['POST', false], ['DELETE', false], ['PATCH', false]],
                },
                {
                  text: 'Що означає код статусу 404?',
                  type: 'SINGLE',
                  answers: [['Ресурс не знайдено', true], ['Доступ заборонено', false], ['Помилка сервера', false]],
                },
                {
                  text: 'Які теги є семантичними?',
                  type: 'MULTIPLE',
                  answers: [['<nav>', true], ['<article>', true], ['<div>', false], ['<span>', false]],
                },
                {
                  text: 'Де розміщують тег <title>?',
                  type: 'SINGLE',
                  answers: [['У <head>', true], ['У <body>', false], ['Перед <html>', false]],
                },
                {
                  text: 'Що додає HTTPS порівняно з HTTP?',
                  type: 'SINGLE',
                  answers: [['Шифрування трафіку через TLS', true], ['Швидше завантаження картинок', false], ['Нові методи запитів', false]],
                },
              ],
            },
          },
        ],
      },
      {
        title: 'CSS і верстка',
        lessons: [
          {
            title: 'Селектори та каскад',
            content: `<h2>Як CSS знаходить елементи</h2>
<ul>
<li><code>p</code> — усі абзаци (селектор тегу).</li>
<li><code>.card</code> — елементи з класом <code>card</code>.</li>
<li><code>#main</code> — елемент з ідентифікатором <code>main</code>.</li>
<li><code>.card h2</code> — заголовки всередині картки.</li>
<li><code>a:hover</code> — посилання під курсором (псевдоклас).</li>
</ul>
<h2>Каскад і специфічність</h2>
<p>Коли кілька правил задають одну властивість, перемагає правило з вищою <strong>специфічністю</strong>: inline-стиль сильніший за <code>#id</code>, той — за <code>.class</code>, а клас — за тег. Якщо специфічність однакова, перемагає правило, оголошене пізніше.</p>
<pre><code>p { color: gray; }
.lead { color: black; }   /* переможе для &lt;p class="lead"&gt; */</code></pre>
<h2>Успадкування</h2>
<p>Деякі властивості (колір, шрифт) передаються дочірнім елементам, інші (відступи, рамки) — ні. Тому шрифт зручно задати один раз на <code>body</code>.</p>
<p>Порада: уникайте <code>!important</code> — він ламає передбачуваність каскаду. Краще зробіть селектор точнішим або змініть порядок правил.</p>`,
          },
          {
            title: 'Блокова модель',
            content: `<h2>Кожен елемент — прямокутник</h2>
<p>Розмір елемента складається з чотирьох шарів: <strong>content</strong> (вміст), <strong>padding</strong> (внутрішній відступ), <strong>border</strong> (рамка) і <strong>margin</strong> (зовнішній відступ).</p>
<h2>box-sizing</h2>
<p>За замовчуванням <code>width</code> задає ширину лише вмісту, тож padding і border її збільшують. Тому майже всі проєкти починаються з правила:</p>
<pre><code>*, *::before, *::after {
  box-sizing: border-box;
}</code></pre>
<p>Тепер <code>width: 300px</code> означає повну ширину разом з відступами та рамкою.</p>
<h2>Блокові та рядкові елементи</h2>
<ul>
<li><strong>Блокові</strong> (<code>div</code>, <code>p</code>, <code>h1</code>) займають усю ширину і починаються з нового рядка.</li>
<li><strong>Рядкові</strong> (<code>span</code>, <code>a</code>, <code>strong</code>) стоять у потоці тексту, і <code>width</code> на них не діє.</li>
<li><code>display: inline-block</code> поєднує обидва: стоїть у рядку, але приймає розміри.</li>
</ul>
<p>Зверніть увагу на «злипання» вертикальних margin: якщо два блоки стоять один під одним, між ними буде більший з двох відступів, а не їхня сума.</p>`,
          },
          {
            title: 'Flexbox і Grid на практиці',
            content: `<h2>Flexbox — розкладка в один вимір</h2>
<p>Flexbox розташовує елементи вздовж однієї осі: у рядок або в стовпчик. Він ідеальний для панелей кнопок, шапок і карток.</p>
<pre><code>.toolbar {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
}</code></pre>
<p><code>justify-content</code> керує розподілом уздовж головної осі, <code>align-items</code> — уздовж поперечної, а <code>flex-wrap: wrap</code> дозволяє переносити елементи на новий рядок на вузьких екранах.</p>
<h2>Grid — розкладка у два виміри</h2>
<p>Grid задає одночасно колонки й рядки. Класичний адаптивний каталог без жодного media query:</p>
<pre><code>.catalog {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 20px;
}</code></pre>
<p>Браузер сам вирішить, скільки колонок по 260 px вміщується: чотири на ноутбуці, одна на телефоні.</p>
<h2>Що обрати</h2>
<ul>
<li>Елементи в лінію, кількість невідома — <strong>Flexbox</strong>.</li>
<li>Сітка з рівними колонками чи складний макет сторінки — <strong>Grid</strong>.</li>
</ul>`,
            test: {
              title: 'Тест: CSS-верстка',
              timeLimit: 10,
              questions: [
                {
                  text: 'Який селектор має найвищу специфічність?',
                  type: 'SINGLE',
                  answers: [['#header', true], ['.header', false], ['header', false]],
                },
                {
                  text: 'Що робить box-sizing: border-box?',
                  type: 'SINGLE',
                  answers: [['Включає padding і border у ширину елемента', true], ['Прибирає рамку', false], ['Робить елемент рядковим', false]],
                },
                {
                  text: 'Які властивості належать до Flexbox-контейнера?',
                  type: 'MULTIPLE',
                  answers: [['justify-content', true], ['flex-wrap', true], ['grid-template-columns', false], ['float', false]],
                },
                {
                  text: 'Що створює repeat(auto-fill, minmax(260px, 1fr))?',
                  type: 'SINGLE',
                  answers: [['Стільки колонок мінімум по 260 px, скільки вміщується', true], ['Рівно 260 колонок', false], ['Одну колонку шириною 260 px', false]],
                },
                {
                  text: 'Які шари входять у блокову модель?',
                  type: 'MULTIPLE',
                  answers: [['padding', true], ['border', true], ['margin', true], ['z-index', false]],
                },
              ],
            },
          },
        ],
      },
      {
        title: 'JavaScript у браузері',
        lessons: [
          {
            title: 'Змінні та типи даних',
            content: `<h2>let і const</h2>
<p>Змінні оголошують через <code>const</code>, якщо значення не буде перепризначатися, і через <code>let</code> — якщо буде. Старий <code>var</code> у новому коді не використовують: у нього функціональна, а не блокова область видимості.</p>
<pre><code>const name = 'Олена';
let score = 0;
score = score + 10;</code></pre>
<h2>Примітивні типи</h2>
<ul>
<li><code>string</code> — текст: <code>'привіт'</code>.</li>
<li><code>number</code> — і цілі, і дробові числа: <code>42</code>, <code>3.14</code>.</li>
<li><code>boolean</code> — <code>true</code> або <code>false</code>.</li>
<li><code>null</code> — «навмисно порожньо», <code>undefined</code> — «значення не задано».</li>
<li><code>bigint</code> і <code>symbol</code> — для спеціальних випадків.</li>
</ul>
<h2>Об'єкти та масиви</h2>
<pre><code>const course = { title: 'Веб', lessons: 8 };
const tags = ['html', 'css', 'js'];
console.log(course.title, tags.length);</code></pre>
<h2>Порівняння</h2>
<p>Завжди використовуйте строге порівняння <code>===</code>: воно не перетворює типи. Вираз <code>'5' == 5</code> дає <code>true</code>, а <code>'5' === 5</code> — <code>false</code>, і саме друге зазвичай те, що ви мали на увазі.</p>`,
          },
          {
            title: 'Події та DOM',
            content: `<h2>DOM — дерево сторінки</h2>
<p>Браузер перетворює HTML на дерево об'єктів — <strong>DOM</strong>. JavaScript може знаходити вузли, змінювати їхній текст, атрибути й класи.</p>
<pre><code>const button = document.querySelector('#like');
const counter = document.querySelector('.likes');
let likes = 0;

button.addEventListener('click', () =&gt; {
  likes += 1;
  counter.textContent = String(likes);
});</code></pre>
<h2>Події</h2>
<p>Найчастіші події: <code>click</code>, <code>input</code> (зміна поля), <code>submit</code> (відправка форми), <code>keydown</code>. Обробник отримує об'єкт події; для форм зазвичай викликають <code>event.preventDefault()</code>, щоб сторінка не перезавантажувалася.</p>
<h2>Безпека: textContent, а не innerHTML</h2>
<p>Якщо показуєте текст, який ввів користувач, використовуйте <code>textContent</code>. Властивість <code>innerHTML</code> інтерпретує рядок як HTML, і зловмисник може вставити шкідливий скрипт — це атака XSS.</p>
<h2>Делегування подій</h2>
<p>Замість того щоб вішати обробник на кожен елемент списку, повісьте один на батьківський елемент і перевіряйте <code>event.target</code>. Так обробник працюватиме і для елементів, доданих пізніше.</p>`,
            test: {
              title: 'Тест: JavaScript у браузері',
              timeLimit: 10,
              questions: [
                {
                  text: 'Яке ключове слово використати для значення, що не перепризначається?',
                  type: 'SINGLE',
                  answers: [['const', true], ['let', false], ['var', false]],
                },
                {
                  text: 'Чому дорівнює вираз \'5\' === 5?',
                  type: 'SINGLE',
                  answers: [['false', true], ['true', false], ['undefined', false]],
                },
                {
                  text: 'Які з типів є примітивними у JavaScript?',
                  type: 'MULTIPLE',
                  answers: [['string', true], ['boolean', true], ['number', true], ['array', false]],
                },
                {
                  text: 'Як безпечно вивести текст, введений користувачем?',
                  type: 'SINGLE',
                  answers: [['Через textContent', true], ['Через innerHTML', false], ['Через document.write', false]],
                },
              ],
            },
          },
        ],
      },
    ],
  },

  // ───────────────────────────── TypeScript ─────────────────────────────
  {
    key: 'ts',
    title: 'TypeScript для початківців',
    description:
      'Від базових типів та інтерфейсів до дженериків. Кожен розділ закінчується тестом, а питання можна поставити викладачеві в чаті курсу.',
    category: 'Програмування',
    level: 'INTERMEDIATE',
    price: 1200,
    autoApprove: true,
    published: true,
    teacher: 'teacher2',
    sections: [
      {
        title: 'Знайомство з TypeScript',
        lessons: [
          {
            title: 'Навіщо потрібен TypeScript',
            content: `<h2>JavaScript з типами</h2>
<p>TypeScript — це надмножина JavaScript від Microsoft: будь-який коректний JS-код є коректним TS-кодом. Компілятор <code>tsc</code> перевіряє типи і перетворює код на звичайний JavaScript, який виконує браузер або Node.js.</p>
<h2>Що це дає</h2>
<ul>
<li><strong>Помилки до запуску.</strong> Опечатка в назві поля чи передача рядка замість числа ловляться ще в редакторі.</li>
<li><strong>Підказки в IDE.</strong> Автодоповнення знає структуру ваших об'єктів.</li>
<li><strong>Безпечний рефакторинг.</strong> Перейменували поле — компілятор покаже всі місця, які треба оновити.</li>
<li><strong>Документація в коді.</strong> Сигнатура функції одразу пояснює, що вона приймає і повертає.</li>
</ul>
<pre><code>function total(price: number, qty: number): number {
  return price * qty;
}
total('100', 2); // помилка: string не можна передати як number</code></pre>
<h2>Важливо пам'ятати</h2>
<p>Типи існують лише під час компіляції. У зібраному JavaScript їх немає, тому дані з мережі чи форм усе одно треба перевіряти під час виконання — наприклад, бібліотекою валідації.</p>`,
          },
          {
            title: 'Базові типи',
            content: `<h2>Анотації типів</h2>
<pre><code>let title: string = 'TypeScript';
let lessons: number = 21;
let published: boolean = true;
let tags: string[] = ['ts', 'js'];
let point: [number, number] = [10, 20]; // кортеж</code></pre>
<p>Часто анотація не потрібна: TypeScript сам <strong>виводить тип</strong> з початкового значення. <code>const count = 5</code> вже має тип <code>number</code>.</p>
<h2>any, unknown і never</h2>
<ul>
<li><code>any</code> вимикає перевірку — використовуйте лише як тимчасовий виняток.</li>
<li><code>unknown</code> — безпечна альтернатива: значення можна використати лише після перевірки його типу.</li>
<li><code>never</code> — тип значення, якого не може бути (наприклад, функція, яка завжди кидає помилку).</li>
</ul>
<h2>null і undefined</h2>
<p>З увімкненим <code>strictNullChecks</code> (входить у режим <code>strict</code>) тип <code>string</code> не допускає <code>null</code>. Щоб дозволити, пишуть об'єднання <code>string | null</code>, і компілятор змусить перевірити значення перед використанням.</p>
<pre><code>function greet(name: string | null) {
  return name ? \`Привіт, \${name}\` : 'Привіт, гостю';
}</code></pre>`,
            test: {
              title: 'Тест: знайомство з TypeScript',
              timeLimit: 10,
              questions: [
                {
                  text: 'У що компілюється TypeScript?',
                  type: 'SINGLE',
                  answers: [['У JavaScript', true], ['У WebAssembly', false], ['У байт-код Java', false]],
                },
                {
                  text: 'Чи існують типи TypeScript під час виконання програми?',
                  type: 'SINGLE',
                  answers: [['Ні, лише під час компіляції', true], ['Так, завжди', false], ['Лише в браузері', false]],
                },
                {
                  text: 'Який тип безпечніший для значень невідомого походження?',
                  type: 'SINGLE',
                  answers: [['unknown', true], ['any', false], ['never', false]],
                },
                {
                  text: 'Які записи є коректними анотаціями?',
                  type: 'MULTIPLE',
                  answers: [['let a: string[] = []', true], ['let p: [number, number] = [1, 2]', true], ['let n: num = 5', false]],
                },
              ],
            },
          },
        ],
      },
      {
        title: 'Інтерфейси і типи',
        lessons: [
          {
            title: 'Інтерфейси та псевдоніми типів',
            content: `<h2>Опис форми об'єкта</h2>
<pre><code>interface Course {
  id: number;
  title: string;
  description?: string;      // необов'язкове поле
  readonly createdAt: Date;  // не можна змінити
}</code></pre>
<p>Той самий опис можна зробити через псевдонім типу:</p>
<pre><code>type Course = {
  id: number;
  title: string;
};</code></pre>
<h2>У чому різниця</h2>
<ul>
<li><code>interface</code> можна <strong>розширювати</strong> через <code>extends</code> і доповнювати повторним оголошенням.</li>
<li><code>type</code> вміє більше: об'єднання (<code>'a' | 'b'</code>), кортежі, умовні типи.</li>
<li>Для форм об'єктів обидва варіанти рівноцінні — оберіть один стиль і дотримуйтеся його в проєкті.</li>
</ul>
<pre><code>interface PaidCourse extends Course {
  price: number;
}</code></pre>
<h2>Структурна типізація</h2>
<p>TypeScript порівнює типи за формою, а не за назвою. Якщо об'єкт має всі потрібні поля інтерфейсу, він йому відповідає, навіть якщо ніде явно не сказано <code>implements</code>.</p>`,
          },
          {
            title: 'Об\'єднання та звуження типів',
            content: `<h2>Об'єднання</h2>
<p>Тип <code>A | B</code> означає «або A, або B». Особливо зручні об'єднання літералів:</p>
<pre><code>type Status = 'PENDING' | 'ACTIVE' | 'REJECTED';</code></pre>
<p>Тепер змінна приймає лише ці три рядки, а редактор підкаже їх під час набору.</p>
<h2>Звуження (narrowing)</h2>
<p>Щоб працювати зі значенням об'єднаного типу, його треба «звузити» перевіркою:</p>
<pre><code>function format(value: string | number) {
  if (typeof value === 'number') {
    return value.toFixed(2);   // тут value: number
  }
  return value.trim();         // тут value: string
}</code></pre>
<p>Компілятор розуміє <code>typeof</code>, <code>instanceof</code>, <code>in</code>, порівняння з літералами і перевірки на <code>null</code>.</p>
<h2>Дискриміновані об'єднання</h2>
<pre><code>type Result =
  | { ok: true; data: string }
  | { ok: false; error: string };

function show(r: Result) {
  return r.ok ? r.data : r.error;
}</code></pre>
<p>Спільне поле <code>ok</code> дозволяє TypeScript точно знати, які ще поля доступні в кожній гілці.</p>`,
            test: {
              title: 'Тест: інтерфейси і типи',
              timeLimit: 10,
              questions: [
                {
                  text: 'Як позначити необов\'язкове поле в інтерфейсі?',
                  type: 'SINGLE',
                  answers: [['title?: string', true], ['title!: string', false], ['optional title: string', false]],
                },
                {
                  text: 'Що вміє type, але не вміє interface?',
                  type: 'SINGLE',
                  answers: [['Описувати об\'єднання літералів', true], ['Описувати поля об\'єкта', false], ['Мати readonly поля', false]],
                },
                {
                  text: 'Якими перевірками можна звузити тип?',
                  type: 'MULTIPLE',
                  answers: [['typeof', true], ['instanceof', true], ['оператор in', true], ['console.log', false]],
                },
                {
                  text: 'За яким принципом TypeScript порівнює типи?',
                  type: 'SINGLE',
                  answers: [['За структурою (формою)', true], ['За назвою типу', false], ['За файлом оголошення', false]],
                },
              ],
            },
          },
        ],
      },
      {
        title: 'Функції та дженерики',
        lessons: [
          {
            title: 'Типізація функцій',
            content: `<h2>Параметри і результат</h2>
<pre><code>function discount(price: number, percent = 10): number {
  return price - (price * percent) / 100;
}</code></pre>
<p>Параметр зі значенням за замовчуванням автоматично стає необов'язковим, а його тип виводиться зі значення.</p>
<h2>Тип функції</h2>
<pre><code>type Handler = (event: string, payload?: unknown) =&gt; void;

const log: Handler = (event) =&gt; console.log(event);</code></pre>
<h2>Необов'язкові та rest-параметри</h2>
<pre><code>function join(separator: string, ...parts: string[]) {
  return parts.join(separator);
}
join(', ', 'HTML', 'CSS', 'JS');</code></pre>
<h2>void і повернення значень</h2>
<p><code>void</code> означає, що результат функції не використовується. Якщо функція може нічого не знайти, чесніше повертати <code>T | undefined</code> — тоді компілятор змусить перевірити результат.</p>
<pre><code>function findCourse(id: number): Course | undefined {
  return courses.find((c) =&gt; c.id === id);
}</code></pre>
<p>Порада: явно вказуйте тип результату для публічних функцій модуля — це захищає від випадкової зміни контракту.</p>`,
          },
          {
            title: 'Дженерики',
            content: `<h2>Функції, що працюють з будь-яким типом</h2>
<p>Дженерик — це параметр типу. Він дозволяє написати одну функцію для різних типів, не втрачаючи інформації про них:</p>
<pre><code>function first&lt;T&gt;(items: T[]): T | undefined {
  return items[0];
}

const n = first([1, 2, 3]);        // number | undefined
const s = first(['a', 'b']);       // string | undefined</code></pre>
<p>Якби ми використали <code>any</code>, результат втратив би тип. З дженериком TypeScript сам підставляє <code>T</code> з аргументу.</p>
<h2>Обмеження</h2>
<pre><code>function byId&lt;T extends { id: number }&gt;(items: T[], id: number) {
  return items.find((i) =&gt; i.id === id);
}</code></pre>
<p><code>extends</code> вимагає, щоб тип мав поле <code>id</code>.</p>
<h2>Дженерики в типах</h2>
<pre><code>interface Paginated&lt;T&gt; {
  items: T[];
  total: number;
  page: number;
}

type CoursePage = Paginated&lt;Course&gt;;</code></pre>
<p>Вбудовані утиліти теж є дженериками: <code>Partial&lt;T&gt;</code> робить усі поля необов'язковими, <code>Pick&lt;T, K&gt;</code> вибирає частину полів, <code>Record&lt;K, V&gt;</code> описує словник.</p>`,
            test: {
              title: 'Тест: функції та дженерики',
              timeLimit: 15,
              questions: [
                {
                  text: 'Що поверне first<T>(items: T[]) для масиву рядків?',
                  type: 'SINGLE',
                  answers: [['string | undefined', true], ['any', false], ['T[]', false]],
                },
                {
                  text: 'Що робить запис T extends { id: number }?',
                  type: 'SINGLE',
                  answers: [['Вимагає, щоб тип мав поле id', true], ['Успадковує клас', false], ['Створює новий об\'єкт', false]],
                },
                {
                  text: 'Які з утиліт є вбудованими дженериками TypeScript?',
                  type: 'MULTIPLE',
                  answers: [['Partial<T>', true], ['Pick<T, K>', true], ['Record<K, V>', true], ['Optional<T>', false]],
                },
                {
                  text: 'Як позначити, що результат функції не використовується?',
                  type: 'SINGLE',
                  answers: [['void', true], ['null', false], ['never', false]],
                },
                {
                  text: 'Що відбувається з параметром, який має значення за замовчуванням?',
                  type: 'SINGLE',
                  answers: [['Він стає необов\'язковим', true], ['Він стає readonly', false], ['Його тип стає any', false]],
                },
              ],
            },
          },
        ],
      },
    ],
  },

  // ───────────────────────────── Бази даних і SQL ─────────────────────────────
  {
    key: 'sql',
    title: 'Бази даних і SQL',
    description:
      'Реляційна модель, нормалізація, SELECT і JOIN-запити, агрегація, індекси та транзакції на прикладі PostgreSQL. Запис за схваленням викладача.',
    category: 'Бази даних',
    level: 'INTERMEDIATE',
    price: 0,
    autoApprove: false,
    published: true,
    teacher: 'teacher1',
    sections: [
      {
        title: 'Реляційна модель',
        lessons: [
          {
            title: 'Таблиці, ключі та зв\'язки',
            content: `<h2>Таблиця — це множина рядків</h2>
<p>Реляційна база зберігає дані в таблицях. Кожен рядок — один запис, кожна колонка — атрибут з чітким типом: <code>integer</code>, <code>text</code>, <code>boolean</code>, <code>timestamp</code>.</p>
<h2>Первинний ключ</h2>
<p><strong>Primary key</strong> однозначно ідентифікує рядок. Найчастіше це автоінкрементне число або UUID.</p>
<pre><code>CREATE TABLE courses (
  id     SERIAL PRIMARY KEY,
  title  TEXT NOT NULL,
  price  INTEGER NOT NULL DEFAULT 0
);</code></pre>
<h2>Зовнішній ключ</h2>
<p><strong>Foreign key</strong> посилається на первинний ключ іншої таблиці і гарантує, що посилання не «висить у повітрі».</p>
<pre><code>CREATE TABLE lessons (
  id        SERIAL PRIMARY KEY,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title     TEXT NOT NULL
);</code></pre>
<p><code>ON DELETE CASCADE</code> означає: видалили курс — автоматично видаляться його уроки.</p>
<h2>Типи зв'язків</h2>
<ul>
<li><strong>Один до багатьох</strong> — курс і уроки (зовнішній ключ у «багатьох»).</li>
<li><strong>Багато до багатьох</strong> — студенти і курси, через проміжну таблицю записів (enrollments).</li>
<li><strong>Один до одного</strong> — користувач і його профіль (унікальний зовнішній ключ).</li>
</ul>`,
          },
          {
            title: 'Нормалізація',
            content: `<h2>Навіщо нормалізувати</h2>
<p>Якщо одна й та сама інформація зберігається в кількох місцях, рано чи пізно копії розійдуться. Нормалізація — це розбиття даних на таблиці так, щоб кожен факт зберігався один раз.</p>
<h2>Перші три нормальні форми</h2>
<ol>
<li><strong>1НФ:</strong> у кожній клітинці одне атомарне значення. Не «html, css, js» в одній колонці, а окрема таблиця тегів.</li>
<li><strong>2НФ:</strong> кожна неключова колонка залежить від усього складеного ключа, а не від його частини.</li>
<li><strong>3НФ:</strong> неключові колонки не залежать одна від одної. Ім'я викладача не дублюється в кожному курсі — курс зберігає лише <code>teacher_id</code>.</li>
</ol>
<h2>Приклад</h2>
<p>Погано: таблиця <code>enrollments(student_email, student_name, course_title)</code>. Змінила студентка ім'я — треба оновити всі її записи.</p>
<p>Добре: <code>users(id, email, name)</code>, <code>courses(id, title)</code>, <code>enrollments(user_id, course_id, status)</code>.</p>
<h2>Денормалізація</h2>
<p>Іноді дані свідомо дублюють заради швидкості читання — наприклад, зберігають кількість студентів курсу. Це компроміс: виграємо в швидкості, але беремо на себе обов'язок підтримувати копію в актуальному стані.</p>`,
            test: {
              title: 'Тест: реляційна модель',
              timeLimit: 10,
              questions: [
                {
                  text: 'Що однозначно ідентифікує рядок таблиці?',
                  type: 'SINGLE',
                  answers: [['Первинний ключ', true], ['Зовнішній ключ', false], ['Індекс', false]],
                },
                {
                  text: 'Як реалізують зв\'язок «багато до багатьох»?',
                  type: 'SINGLE',
                  answers: [['Через проміжну таблицю', true], ['Одним зовнішнім ключем', false], ['Масивом у колонці', false]],
                },
                {
                  text: 'Що робить ON DELETE CASCADE?',
                  type: 'SINGLE',
                  answers: [['Видаляє залежні рядки разом з батьківським', true], ['Забороняє видалення', false], ['Обнуляє зовнішній ключ', false]],
                },
                {
                  text: 'Які твердження відповідають 1НФ?',
                  type: 'MULTIPLE',
                  answers: [['У клітинці одне атомарне значення', true], ['Немає списків через кому в одній колонці', true], ['Усі таблиці мають однакову кількість колонок', false]],
                },
              ],
            },
          },
        ],
      },
      {
        title: 'SQL-запити',
        lessons: [
          {
            title: 'SELECT, WHERE і ORDER BY',
            content: `<h2>Вибірка даних</h2>
<pre><code>SELECT title, price
FROM courses
WHERE price &gt; 0
ORDER BY price DESC
LIMIT 5;</code></pre>
<p>Запит читається так: «з таблиці courses візьми назву і ціну платних курсів, відсортуй від найдорожчого і поверни перші п'ять».</p>
<h2>Умови в WHERE</h2>
<ul>
<li>Порівняння: <code>=</code>, <code>&lt;&gt;</code>, <code>&gt;</code>, <code>&lt;=</code>.</li>
<li>Логіка: <code>AND</code>, <code>OR</code>, <code>NOT</code>.</li>
<li>Діапазон і список: <code>BETWEEN 100 AND 500</code>, <code>IN ('Дизайн', 'Мови')</code>.</li>
<li>Пошук за шаблоном: <code>ILIKE '%sql%'</code> (в PostgreSQL без урахування регістру).</li>
<li>Порожні значення: <code>IS NULL</code>, <code>IS NOT NULL</code> — звичайне <code>= NULL</code> не працює.</li>
</ul>
<h2>Порядок виконання</h2>
<p>Хоча пишемо ми <code>SELECT</code> першим, логічно СУБД виконує запит у порядку: <code>FROM → WHERE → GROUP BY → HAVING → SELECT → ORDER BY → LIMIT</code>. Тому псевдонім колонки з <code>SELECT</code> не можна використати у <code>WHERE</code>.</p>`,
          },
          {
            title: 'Агрегатні функції і GROUP BY',
            content: `<h2>Агрегатні функції</h2>
<p>Вони рахують одне значення для групи рядків: <code>COUNT</code>, <code>SUM</code>, <code>AVG</code>, <code>MIN</code>, <code>MAX</code>.</p>
<pre><code>SELECT COUNT(*) AS total, AVG(score) AS avg_score
FROM test_results
WHERE finished_at IS NOT NULL;</code></pre>
<h2>Групування</h2>
<p><code>GROUP BY</code> розбиває рядки на групи, і агрегат рахується для кожної:</p>
<pre><code>SELECT course_id, COUNT(*) AS students
FROM enrollments
WHERE status = 'ACTIVE'
GROUP BY course_id;</code></pre>
<p>Правило: у <code>SELECT</code> можуть бути лише колонки з <code>GROUP BY</code> та агрегатні функції.</p>
<h2>HAVING проти WHERE</h2>
<ul>
<li><code>WHERE</code> фільтрує <strong>рядки</strong> до групування.</li>
<li><code>HAVING</code> фільтрує <strong>групи</strong> після групування.</li>
</ul>
<pre><code>SELECT course_id, COUNT(*) AS students
FROM enrollments
GROUP BY course_id
HAVING COUNT(*) &gt;= 10;</code></pre>
<p>Зверніть увагу: <code>COUNT(column)</code> не рахує <code>NULL</code>, а <code>COUNT(*)</code> рахує всі рядки.</p>`,
          },
          {
            title: 'JOIN-запити',
            content: `<h2>З'єднання таблиць</h2>
<p>JOIN поєднує рядки двох таблиць за умовою, найчастіше — за зовнішнім ключем.</p>
<pre><code>SELECT c.title, u.email
FROM enrollments e
JOIN courses c ON c.id = e.course_id
JOIN users   u ON u.id = e.user_id
WHERE e.status = 'ACTIVE';</code></pre>
<h2>Види JOIN</h2>
<ul>
<li><strong>INNER JOIN</strong> (або просто JOIN) — лише рядки, для яких знайшовся збіг в обох таблицях.</li>
<li><strong>LEFT JOIN</strong> — усі рядки лівої таблиці; якщо збігу справа немає, колонки правої будуть <code>NULL</code>.</li>
<li><strong>RIGHT JOIN</strong> — дзеркально: усі рядки правої таблиці.</li>
<li><strong>FULL JOIN</strong> — усі рядки з обох таблиць.</li>
<li><strong>CROSS JOIN</strong> — кожен рядок з кожним (декартів добуток).</li>
</ul>
<h2>Типовий приклад LEFT JOIN</h2>
<p>Знайти курси без жодного студента:</p>
<pre><code>SELECT c.title
FROM courses c
LEFT JOIN enrollments e ON e.course_id = c.id
WHERE e.id IS NULL;</code></pre>
<p>Порада: завжди давайте таблицям короткі псевдоніми і вказуйте їх перед назвами колонок — так запит легше читати, і не буде помилок через однакові назви колонок.</p>`,
            test: {
              title: 'Тест: SQL-запити',
              timeLimit: 15,
              questions: [
                {
                  text: 'Який JOIN поверне всі рядки лівої таблиці, навіть без збігів у правій?',
                  type: 'SINGLE',
                  answers: [['LEFT JOIN', true], ['INNER JOIN', false], ['CROSS JOIN', false], ['RIGHT JOIN', false]],
                },
                {
                  text: 'Чим HAVING відрізняється від WHERE?',
                  type: 'SINGLE',
                  answers: [['HAVING фільтрує групи після GROUP BY', true], ['HAVING працює лише з текстом', false], ['Нічим, це синоніми', false]],
                },
                {
                  text: 'Як правильно перевірити відсутність значення?',
                  type: 'SINGLE',
                  answers: [['column IS NULL', true], ['column = NULL', false], ['column == NULL', false]],
                },
                {
                  text: 'Які з функцій є агрегатними?',
                  type: 'MULTIPLE',
                  answers: [['COUNT', true], ['AVG', true], ['MAX', true], ['UPPER', false]],
                },
                {
                  text: 'Що поверне INNER JOIN?',
                  type: 'SINGLE',
                  answers: [['Лише рядки зі збігом в обох таблицях', true], ['Усі рядки обох таблиць', false], ['Кожен рядок з кожним', false]],
                },
                {
                  text: 'Яка частина запиту логічно виконується першою?',
                  type: 'SINGLE',
                  answers: [['FROM', true], ['SELECT', false], ['ORDER BY', false]],
                },
              ],
            },
          },
        ],
      },
      {
        title: 'Продуктивність і надійність',
        lessons: [
          {
            title: 'Індекси',
            content: `<h2>Навіщо індекс</h2>
<p>Без індексу СУБД шукає рядки, переглядаючи всю таблицю (<strong>Seq Scan</strong>). Індекс — окрема впорядкована структура (у PostgreSQL за замовчуванням B-tree), яка дозволяє знайти потрібні рядки за логарифмічний час, як предметний покажчик у книжці.</p>
<pre><code>CREATE INDEX idx_enrollments_user ON enrollments(user_id);</code></pre>
<h2>Коли індекс допомагає</h2>
<ul>
<li>Колонки в умовах <code>WHERE</code> і <code>JOIN</code>.</li>
<li>Сортування <code>ORDER BY</code> за проіндексованою колонкою.</li>
<li>Унікальні обмеження — <code>UNIQUE</code> автоматично створює індекс.</li>
</ul>
<h2>Ціна індексів</h2>
<p>Кожен індекс займає місце і сповільнює <code>INSERT</code>, <code>UPDATE</code>, <code>DELETE</code>, бо його теж треба оновлювати. Тому індексують не все підряд, а колонки, за якими реально шукають.</p>
<h2>Як перевірити</h2>
<pre><code>EXPLAIN ANALYZE
SELECT * FROM enrollments WHERE user_id = 42;</code></pre>
<p>У плані запиту шукайте <code>Index Scan</code> замість <code>Seq Scan</code>. Для маленьких таблиць СУБД може свідомо обрати повний перегляд — це нормально.</p>`,
          },
          {
            title: 'Транзакції та ACID',
            content: `<h2>Транзакція — все або нічого</h2>
<p>Покупка курсу — це два записи: платіж і запис на курс. Якщо другий не вдасться, перший теж треба скасувати. Для цього їх об'єднують у транзакцію:</p>
<pre><code>BEGIN;
INSERT INTO payments (user_id, course_id, amount) VALUES (7, 3, 1200);
INSERT INTO enrollments (user_id, course_id, status) VALUES (7, 3, 'ACTIVE');
COMMIT;   -- або ROLLBACK, якщо щось пішло не так</code></pre>
<h2>Властивості ACID</h2>
<ul>
<li><strong>Atomicity</strong> (атомарність) — транзакція виконується повністю або не виконується зовсім.</li>
<li><strong>Consistency</strong> (узгодженість) — після транзакції всі обмеження бази (ключі, NOT NULL, CHECK) дотримано.</li>
<li><strong>Isolation</strong> (ізольованість) — паралельні транзакції не бачать проміжних станів одна одної.</li>
<li><strong>Durability</strong> (довговічність) — після COMMIT дані не зникнуть навіть при збої живлення.</li>
</ul>
<h2>Рівні ізоляції</h2>
<p>PostgreSQL за замовчуванням працює на рівні <code>READ COMMITTED</code>. Найсуворіший рівень <code>SERIALIZABLE</code> гарантує результат, як при послідовному виконанні, але може відхиляти транзакції з помилкою серіалізації — їх треба повторювати.</p>`,
            test: {
              title: 'Тест: індекси і транзакції',
              timeLimit: 10,
              questions: [
                {
                  text: 'Яку структуру PostgreSQL використовує для індексу за замовчуванням?',
                  type: 'SINGLE',
                  answers: [['B-tree', true], ['Hash', false], ['GiST', false]],
                },
                {
                  text: 'Що сповільнюють зайві індекси?',
                  type: 'MULTIPLE',
                  answers: [['INSERT', true], ['UPDATE', true], ['DELETE', true]],
                },
                {
                  text: 'Що означає літера A в ACID?',
                  type: 'SINGLE',
                  answers: [['Атомарність', true], ['Доступність', false], ['Асинхронність', false]],
                },
                {
                  text: 'Яка команда скасовує незавершену транзакцію?',
                  type: 'SINGLE',
                  answers: [['ROLLBACK', true], ['COMMIT', false], ['TRUNCATE', false]],
                },
              ],
            },
          },
        ],
      },
    ],
  },

  // ───────────────────────────── UI/UX ─────────────────────────────
  {
    key: 'ux',
    title: 'UI/UX дизайн інтерфейсів',
    description:
      'Як проєктувати зручні інтерфейси: дослідження користувачів, сітки, колір і контраст, адаптивний дизайн і доступність.',
    category: 'Дизайн',
    level: 'BEGINNER',
    price: 0,
    autoApprove: true,
    published: true,
    teacher: 'teacher1',
    sections: [
      {
        title: 'Основи UX',
        lessons: [
          {
            title: 'Що таке UX і UI',
            content: `<h2>Два різні питання</h2>
<p><strong>UX</strong> (user experience, досвід користувача) відповідає на питання «чи зможе людина досягти мети і чи буде їй зручно?». <strong>UI</strong> (user interface) — «як це виглядає: кнопки, кольори, шрифти, відступи».</p>
<p>Гарний UI без продуманого UX — це красива форма, яку ніхто не може заповнити. Продуманий UX з поганим UI — зручний, але неприємний і малозрозумілий продукт.</p>
<h2>Евристики Нільсена</h2>
<p>Якоб Нільсен сформулював 10 принципів зручності. Кілька найважливіших:</p>
<ul>
<li><strong>Видимість стану системи</strong> — користувач завжди знає, що відбувається: індикатор завантаження, прогрес, повідомлення «Збережено».</li>
<li><strong>Відповідність реальному світу</strong> — слова і поняття користувача, а не внутрішні терміни.</li>
<li><strong>Контроль і свобода</strong> — можна скасувати дію або повернутися назад.</li>
<li><strong>Запобігання помилкам</strong> — краще не дати помилитися, ніж гарно повідомити про помилку.</li>
<li><strong>Впізнавання замість запам'ятовування</strong> — варіанти видно, а не треба пам'ятати.</li>
</ul>
<h2>Одна головна дія</h2>
<p>На кожному екрані має бути одна найважливіша дія, виділена кольором: «Продовжити», «Купити», «Почати тест». Якщо все однаково яскраве, нічого не виділяється.</p>`,
          },
          {
            title: 'Дослідження користувачів',
            content: `<h2>Не вгадуйте — питайте і спостерігайте</h2>
<p>Дизайнер — не користувач. Те, що очевидно автору, часто незрозуміло людині, яка бачить продукт уперше.</p>
<h2>Основні методи</h2>
<ul>
<li><strong>Інтерв'ю</strong> — 5–8 розмов з цільовими користувачами про їхні задачі та проблеми. Питайте про минулий досвід («розкажіть, як ви востаннє...»), а не про гіпотетичне майбутнє.</li>
<li><strong>Юзабіліті-тестування</strong> — людина виконує задачу в прототипі, ви мовчки спостерігаєте. За дослідженнями Nielsen Norman Group, п'ятеро учасників виявляють більшість типових проблем.</li>
<li><strong>Аналітика</strong> — кількісні дані: де користувачі залишають сторінку, які кнопки натискають.</li>
<li><strong>Опитування</strong> — швидко зібрати думки багатьох, але без глибини.</li>
</ul>
<h2>Персона і сценарій</h2>
<p><strong>Персона</strong> — узагальнений портрет користувача на основі досліджень: цілі, контекст, обмеження. <strong>Сценарій</strong> — послідовність кроків для досягнення мети, наприклад: «студентка знаходить курс → записується → проходить перший урок з телефона в метро».</p>
<p>Такі сценарії допомагають вирішити, які екрани потрібні і що на них головне.</p>`,
            test: {
              title: 'Тест: основи UX',
              timeLimit: 10,
              questions: [
                {
                  text: 'Що описує UX?',
                  type: 'SINGLE',
                  answers: [['Досвід і зручність досягнення мети', true], ['Лише кольори і шрифти', false], ['Код інтерфейсу', false]],
                },
                {
                  text: 'Які з принципів входять до евристик Нільсена?',
                  type: 'MULTIPLE',
                  answers: [['Видимість стану системи', true], ['Запобігання помилкам', true], ['Максимум анімацій', false], ['Контроль і свобода користувача', true]],
                },
                {
                  text: 'Скільки учасників зазвичай достатньо, щоб виявити більшість проблем у юзабіліті-тесті?',
                  type: 'SINGLE',
                  answers: [['Близько п\'яти', true], ['Не менше ста', false], ['Одного', false]],
                },
                {
                  text: 'Що таке персона?',
                  type: 'SINGLE',
                  answers: [['Узагальнений портрет користувача на основі досліджень', true], ['Реальний клієнт компанії', false], ['Аватар у профілі', false]],
                },
              ],
            },
          },
        ],
      },
      {
        title: 'Візуальний дизайн',
        lessons: [
          {
            title: 'Сітки та відступи',
            content: `<h2>Сітка впорядковує хаос</h2>
<p>Модульна сітка — це система колонок і проміжків, до якої прив'язуються всі елементи. Для веб-сторінок популярна 12-колонкова сітка: 12 ділиться на 2, 3, 4 і 6, тож легко зробити дві, три чи чотири колонки.</p>
<h2>Система відступів</h2>
<p>Замість довільних значень (13 px тут, 17 px там) використовують шкалу, кратну 4 або 8: 4, 8, 12, 16, 24, 32, 48. Інтерфейс одразу виглядає охайніше, а розробникам простіше переносити макет у код.</p>
<h2>Закон близькості</h2>
<p>Елементи, розташовані ближче один до одного, сприймаються як група. Тому відступ між підписом і його полем має бути меншим, ніж між двома полями форми, а між секціями сторінки — ще більшим.</p>
<h2>Вирівнювання</h2>
<ul>
<li>Вирівнюйте текст по лівому краю — так його найлегше читати мовами з письмом зліва направо.</li>
<li>Тримайте спільні лінії вирівнювання: краї карток, заголовків і кнопок.</li>
<li>Обмежуйте довжину рядка тексту приблизно 60–80 символами.</li>
</ul>
<p>Порожній простір — не втрачене місце, а інструмент, що задає ритм і показує ієрархію.</p>`,
          },
          {
            title: 'Колір і контраст',
            content: `<h2>Скільки кольорів потрібно</h2>
<p>Більшості інтерфейсів достатньо нейтральної гами (фон, текст, рамки) і одного акцентного кольору для головних дій. Плюс системні кольори станів: успіх, попередження, помилка.</p>
<h2>Контраст і WCAG</h2>
<p>Стандарт доступності WCAG 2.1 рівня AA вимагає контрасту щонайменше <strong>4.5:1</strong> для звичайного тексту і <strong>3:1</strong> для великого (від 24 px або 18,66 px жирного). Світло-сірий текст на білому фоні часто не проходить цю межу — перевіряйте контраст спеціальними інструментами.</p>
<h2>Колір — не єдиний сигнал</h2>
<p>Близько 8% чоловіків мають ту чи іншу форму порушення колірного зору. Тому помилку в полі позначайте не лише червоною рамкою, а й текстом та іконкою. Статуси в таблиці — не лише кольоровими крапками, а й підписами.</p>
<h2>Темна тема</h2>
<ul>
<li>Не використовуйте чисто чорний фон — м'якший темно-синій або темно-сірий менше втомлює очі.</li>
<li>Насичені кольори на темному фоні варто зробити світлішими.</li>
<li>Тіні майже не видно — розділяйте поверхні відтінками фону.</li>
</ul>
<p>Найпростіше підтримувати дві теми через дизайн-токени: однакові назви змінних з різними значеннями.</p>`,
          },
          {
            title: 'Адаптивний дизайн',
            content: `<h2>Один макет — усі екрани</h2>
<p>Адаптивний дизайн означає, що сторінка підлаштовується під ширину екрана: від телефона 360 px до широкого монітора.</p>
<h2>Спочатку мобільні</h2>
<p>Підхід mobile first: спершу проєктуємо для найвужчого екрана, де місця найменше і доводиться лишити лише головне. Потім додаємо колонки й деталі для ширших екранів. Так ми не «ріжемо» десктопний макет, а нарощуємо мобільний.</p>
<h2>Контрольні точки</h2>
<p>Breakpoints обирають за вмістом, а не за конкретними моделями телефонів: перебудовуйте макет там, де він починає «ламатися». Типові орієнтири — близько 768 px і 1024 px.</p>
<h2>Що змінюється на телефоні</h2>
<ul>
<li>Колонки складаються одна під одну.</li>
<li>Навігація переїжджає в нижнє меню або «бургер».</li>
<li>Таблиці отримують горизонтальну прокрутку або перетворюються на картки.</li>
<li>Цілі для дотику — щонайменше 44×44 px, як радять настанови Apple.</li>
</ul>
<p>Перевіряйте макети в режимі емуляції пристроїв у браузері, але обов'язково — і на справжньому телефоні.</p>`,
            test: {
              title: 'Тест: візуальний дизайн',
              timeLimit: 10,
              questions: [
                {
                  text: 'Який мінімальний контраст WCAG AA для звичайного тексту?',
                  type: 'SINGLE',
                  answers: [['4.5:1', true], ['2:1', false], ['7:1', false]],
                },
                {
                  text: 'Чому 12-колонкова сітка зручна?',
                  type: 'SINGLE',
                  answers: [['12 ділиться на 2, 3, 4 і 6', true], ['Так вимагає браузер', false], ['Вона найвужча', false]],
                },
                {
                  text: 'Як правильно позначити помилку в полі форми?',
                  type: 'MULTIPLE',
                  answers: [['Текстом повідомлення', true], ['Іконкою', true], ['Лише червоним кольором', false]],
                },
                {
                  text: 'Що означає підхід mobile first?',
                  type: 'SINGLE',
                  answers: [['Спочатку проєктуємо для вузького екрана', true], ['Робимо лише мобільний застосунок', false], ['Тестуємо тільки на телефонах', false]],
                },
                {
                  text: 'Який мінімальний розмір цілі для дотику радять настанови Apple?',
                  type: 'SINGLE',
                  answers: [['44×44 px', true], ['16×16 px', false], ['100×100 px', false]],
                },
              ],
            },
          },
        ],
      },
    ],
  },

  // ───────────────────────────── Git ─────────────────────────────
  {
    key: 'git',
    title: 'Git і GitHub з нуля',
    description:
      'Коміти, гілки, злиття і розв\'язання конфліктів, робота з віддаленими репозиторіями та pull request на GitHub.',
    category: 'Інструменти',
    level: 'BEGINNER',
    price: 0,
    autoApprove: true,
    published: true,
    teacher: 'teacher2',
    sections: [
      {
        title: 'Основи Git',
        lessons: [
          {
            title: 'Що таке система контролю версій',
            content: `<h2>Історія змін проєкту</h2>
<p>Система контролю версій зберігає історію змін файлів: хто, що і коли змінив. Можна повернутися до будь-якого попереднього стану, порівняти версії і працювати над одним кодом командою.</p>
<h2>Git — розподілена система</h2>
<p>Git створив Лінус Торвальдс у 2005 році для розробки ядра Linux. На відміну від централізованих систем, у Git кожен розробник має <strong>повну копію репозиторію</strong> з усією історією. Більшість операцій виконуються локально і миттєво, без мережі.</p>
<h2>Три зони Git</h2>
<ol>
<li><strong>Робоча директорія</strong> — файли, які ви редагуєте.</li>
<li><strong>Індекс (staging area)</strong> — зміни, підготовлені до коміту.</li>
<li><strong>Репозиторій</strong> — збережені коміти в папці <code>.git</code>.</li>
</ol>
<h2>Перше налаштування</h2>
<pre><code>git config --global user.name "Олена Коваль"
git config --global user.email "olena@example.com"
git init        # створити репозиторій у поточній папці</code></pre>
<p>Ім'я та email записуються в кожен коміт, тому вкажіть ті, що використовуєте на GitHub.</p>
<p>Git і GitHub — різні речі: Git — програма на вашому комп'ютері, а GitHub — сервіс для зберігання репозиторіїв і спільної роботи над ними.</p>`,
          },
          {
            title: 'Коміти: add, commit, log',
            content: `<h2>Базовий цикл</h2>
<pre><code>git status                 # що змінилося
git add index.html         # додати файл в індекс
git add .                  # додати всі зміни
git commit -m "Додати сторінку курсу"
git log --oneline          # коротка історія</code></pre>
<h2>Що таке коміт</h2>
<p>Коміт — знімок стану проєкту з повідомленням, автором і датою. Кожен коміт має унікальний хеш (наприклад, <code>a1b2c3d</code>) і посилається на попередній, утворюючи історію.</p>
<h2>Гарні повідомлення комітів</h2>
<ul>
<li>Пишіть, <strong>що і навіщо</strong> змінено: «Виправити підрахунок прогресу курсу», а не «fix».</li>
<li>Перший рядок — до 50–72 символів, у наказовому способі.</li>
<li>Один коміт — одна логічна зміна.</li>
</ul>
<h2>Корисні команди</h2>
<pre><code>git diff               # зміни, ще не додані в індекс
git diff --staged      # зміни в індексі
git restore file.txt   # скасувати зміни у файлі
git log -p file.txt    # історія змін конкретного файлу</code></pre>
<p>Файли, які не треба зберігати в репозиторії (залежності, паролі, збірки), перелічують у <code>.gitignore</code>.</p>`,
            test: {
              title: 'Тест: основи Git',
              timeLimit: 10,
              questions: [
                {
                  text: 'Яка команда додає зміни в індекс?',
                  type: 'SINGLE',
                  answers: [['git add', true], ['git commit', false], ['git push', false]],
                },
                {
                  text: 'Чому Git називають розподіленою системою?',
                  type: 'SINGLE',
                  answers: [['Кожен має повну копію репозиторію з історією', true], ['Він працює лише в хмарі', false], ['Файли зберігаються на різних серверах GitHub', false]],
                },
                {
                  text: 'Які зони є в Git?',
                  type: 'MULTIPLE',
                  answers: [['Робоча директорія', true], ['Індекс', true], ['Репозиторій', true], ['Кошик', false]],
                },
                {
                  text: 'Навіщо потрібен файл .gitignore?',
                  type: 'SINGLE',
                  answers: [['Щоб Git не відстежував вказані файли', true], ['Щоб видалити історію', false], ['Щоб приховати репозиторій на GitHub', false]],
                },
              ],
            },
          },
        ],
      },
      {
        title: 'Гілки та злиття',
        lessons: [
          {
            title: 'Гілки',
            content: `<h2>Паралельні лінії розробки</h2>
<p>Гілка в Git — це лише рухомий вказівник на коміт, тому створюються вони миттєво. Нову функцію роблять в окремій гілці, щоб не ламати основну (<code>main</code>).</p>
<pre><code>git switch -c feature/certificates   # створити і перейти
git branch                           # список гілок
git switch main                      # повернутися на main</code></pre>
<h2>Злиття</h2>
<pre><code>git switch main
git merge feature/certificates</code></pre>
<p>Якщо <code>main</code> не змінювався з моменту створення гілки, Git просто пересуне вказівник вперед — це <strong>fast-forward</strong>. Якщо обидві гілки мають нові коміти, Git створить <strong>коміт злиття</strong> з двома батьками.</p>
<h2>Rebase</h2>
<p><code>git rebase main</code> переносить ваші коміти поверх свіжого <code>main</code>, і історія стає лінійною. Але rebase переписує хеші комітів, тому <strong>не робіть rebase гілок, які вже відправили й використовують інші</strong>.</p>
<h2>Типовий процес</h2>
<ol>
<li>Оновити <code>main</code>.</li>
<li>Створити гілку для задачі.</li>
<li>Робити маленькі коміти.</li>
<li>Відкрити pull request і злити після рев'ю.</li>
<li>Видалити гілку.</li>
</ol>`,
          },
          {
            title: 'Конфлікти злиття',
            content: `<h2>Коли виникає конфлікт</h2>
<p>Конфлікт буває, коли дві гілки змінили <strong>одні й ті самі рядки</strong> файлу, і Git не може сам вирішити, яка версія правильна. Зміни в різних місцях файлу Git зливає автоматично.</p>
<h2>Як виглядає конфлікт</h2>
<pre><code>&lt;&lt;&lt;&lt;&lt;&lt;&lt; HEAD
const passingScore = 60;
=======
const passingScore = 70;
&gt;&gt;&gt;&gt;&gt;&gt;&gt; feature/strict-tests</code></pre>
<p>Верхня частина — ваша поточна гілка, нижня — та, яку зливаєте.</p>
<h2>Як розв'язати</h2>
<ol>
<li>Відкрийте файл і залиште правильний варіант (або поєднайте обидва).</li>
<li>Видаліть маркери <code>&lt;&lt;&lt;&lt;&lt;&lt;&lt;</code>, <code>=======</code>, <code>&gt;&gt;&gt;&gt;&gt;&gt;&gt;</code>.</li>
<li>Перевірте, що код працює, і запустіть тести.</li>
<li><code>git add файл</code>, потім <code>git commit</code>.</li>
</ol>
<p>Передумали зливати? <code>git merge --abort</code> поверне все як було.</p>
<h2>Як рідше мати конфлікти</h2>
<ul>
<li>Частіше підтягуйте зміни з <code>main</code>.</li>
<li>Робіть маленькі гілки, що живуть день-два, а не місяць.</li>
<li>Домовтеся про єдиний форматувальник коду в команді.</li>
</ul>`,
            test: {
              title: 'Тест: гілки та злиття',
              timeLimit: 10,
              questions: [
                {
                  text: 'Що таке гілка в Git?',
                  type: 'SINGLE',
                  answers: [['Рухомий вказівник на коміт', true], ['Повна копія проєкту', false], ['Окремий репозиторій', false]],
                },
                {
                  text: 'Яка команда створює нову гілку і переходить на неї?',
                  type: 'SINGLE',
                  answers: [['git switch -c name', true], ['git merge name', false], ['git log name', false]],
                },
                {
                  text: 'Що треба зробити для розв\'язання конфлікту?',
                  type: 'MULTIPLE',
                  answers: [['Видалити маркери конфлікту', true], ['Залишити правильний варіант коду', true], ['Додати файл через git add і закомітити', true], ['Видалити гілку main', false]],
                },
                {
                  text: 'Чого не варто робити з rebase?',
                  type: 'SINGLE',
                  answers: [['Перебазовувати гілки, які вже використовують інші', true], ['Перебазовувати локальну гілку', false], ['Оновлювати свою гілку від main', false]],
                },
              ],
            },
          },
        ],
      },
      {
        title: 'Робота з GitHub',
        lessons: [
          {
            title: 'Віддалені репозиторії: push і pull',
            content: `<h2>Remote</h2>
<p>Віддалений репозиторій (remote) — копія проєкту на сервері, наприклад на GitHub. За замовчуванням він має назву <code>origin</code>.</p>
<pre><code>git clone https://github.com/user/lms.git   # завантажити проєкт
git remote -v                                # список віддалених репозиторіїв</code></pre>
<h2>Обмін змінами</h2>
<pre><code>git push -u origin feature/certificates   # відправити гілку
git pull                                  # отримати і злити зміни
git fetch                                 # лише отримати, без злиття</code></pre>
<p><code>git pull</code> — це <code>fetch</code> плюс <code>merge</code>. Якщо хочете спершу подивитися, що змінилося, зробіть <code>git fetch</code> і порівняйте гілки.</p>
<h2>Аутентифікація</h2>
<p>GitHub не приймає пароль акаунта для операцій Git по HTTPS. Використовуйте <strong>SSH-ключ</strong> або <strong>персональний токен доступу</strong>. SSH-ключ створюється один раз:</p>
<pre><code>ssh-keygen -t ed25519 -C "olena@example.com"</code></pre>
<p>Публічну частину ключа (<code>.pub</code>) додають у налаштуваннях GitHub. Приватну нікому не передають і ніколи не комітять.</p>
<p>Порада: перед <code>git push</code> завжди переглядайте <code>git status</code> і <code>git log</code> — так ви не відправите випадкові файли.</p>`,
          },
          {
            title: 'Pull request і code review',
            content: `<h2>Pull request</h2>
<p>Pull request (PR) — запит на злиття вашої гілки в основну. На GitHub він показує всі зміни, дозволяє обговорити їх і автоматично запускає перевірки (тести, лінтер) через GitHub Actions.</p>
<h2>Хороший PR</h2>
<ul>
<li><strong>Невеликий</strong> — до кількох сотень рядків; великі зміни рев'юїти важко.</li>
<li><strong>Зрозумілий опис</strong> — що змінено, навіщо, як перевірити; скріншоти для змін інтерфейсу.</li>
<li><strong>Зелені перевірки</strong> — тести й лінтер проходять до запиту на рев'ю.</li>
</ul>
<h2>Code review</h2>
<p>Рев'юер перевіряє правильність логіки, читабельність, безпеку і наявність тестів. Коментарі пишуть про код, а не про людину, і пояснюють причину: «Тут можливий XSS, бо текст вставляється через innerHTML — краще textContent».</p>
<h2>Злиття</h2>
<p>GitHub пропонує три способи: звичайний merge-коміт, <strong>squash</strong> (усі коміти PR стискаються в один) і <strong>rebase</strong>. Багато команд обирають squash, щоб історія <code>main</code> була короткою і читабельною.</p>
<p>Після злиття гілку можна видалити — історія залишиться в <code>main</code>.</p>`,
            test: {
              title: 'Тест: робота з GitHub',
              timeLimit: 10,
              questions: [
                {
                  text: 'З яких операцій складається git pull?',
                  type: 'SINGLE',
                  answers: [['fetch і merge', true], ['push і commit', false], ['clone і add', false]],
                },
                {
                  text: 'Як аутентифікуватися в GitHub для операцій Git?',
                  type: 'MULTIPLE',
                  answers: [['SSH-ключем', true], ['Персональним токеном доступу', true], ['Паролем від акаунта по HTTPS', false]],
                },
                {
                  text: 'Що робить squash під час злиття PR?',
                  type: 'SINGLE',
                  answers: [['Стискає всі коміти PR в один', true], ['Видаляє гілку main', false], ['Скасовує PR', false]],
                },
                {
                  text: 'Яка назва віддаленого репозиторію за замовчуванням?',
                  type: 'SINGLE',
                  answers: [['origin', true], ['main', false], ['remote', false]],
                },
              ],
            },
          },
        ],
      },
    ],
  },

  // ───────────────────────────── Англійська для IT ─────────────────────────────
  {
    key: 'english',
    title: 'Англійська для IT',
    description:
      'Читання технічної документації та повідомлень про помилки, робоча комунікація в команді: стендапи, листи, коментарі в code review.',
    category: 'Мови',
    level: 'INTERMEDIATE',
    price: 900,
    autoApprove: true,
    published: true,
    teacher: 'teacher2',
    sections: [
      {
        title: 'Читання документації',
        lessons: [
          {
            title: 'Лексика технічної документації',
            content: `<h2>Слова, які трапляються в кожній документації</h2>
<ul>
<li><strong>deprecated</strong> — застарілий, буде видалений у майбутніх версіях; краще не використовувати.</li>
<li><strong>required / optional</strong> — обов'язковий / необов'язковий параметр.</li>
<li><strong>default</strong> — значення за замовчуванням.</li>
<li><strong>breaking change</strong> — зміна, що ламає зворотну сумісність.</li>
<li><strong>to throw</strong> — кинути виняток: <em>throws an error if the id is invalid</em>.</li>
<li><strong>to return</strong> — повертати значення.</li>
<li><strong>under the hood</strong> — «під капотом», як це влаштовано всередині.</li>
</ul>
<h2>Модальні дієслова в специфікаціях</h2>
<p>У стандартах (наприклад, RFC 2119) слова мають точний зміст: <strong>MUST</strong> — обов'язково, <strong>SHOULD</strong> — рекомендовано, але можливі винятки, <strong>MAY</strong> — на ваш розсуд.</p>
<h2>Як читати документацію швидше</h2>
<ol>
<li>Почніть з розділу <em>Getting Started</em> або <em>Quick Start</em>.</li>
<li>Шукайте приклади коду — вони часто пояснюють краще за текст.</li>
<li>Не перекладайте кожне слово: спершу зрозумійте загальний зміст абзацу.</li>
<li>Виписуйте нові терміни у власний словничок з прикладом речення.</li>
</ol>
<p>Порада: читайте <em>changelog</em> бібліотек, які використовуєте, — це коротка й корисна практика технічної англійської.</p>`,
          },
          {
            title: 'Повідомлення про помилки',
            content: `<h2>Помилка — це підказка</h2>
<p>Більшість повідомлень про помилки побудовані за схемою: <strong>що сталося</strong> + <strong>де</strong> + іноді <strong>як виправити</strong>.</p>
<pre><code>TypeError: Cannot read properties of undefined (reading 'title')
    at renderCourse (course.ts:42:18)</code></pre>
<p>Переклад: «Неможливо прочитати властивість title у значення undefined» — тобто об'єкт, у якого ви берете <code>title</code>, не існує. Рядок 42, символ 18 у файлі <code>course.ts</code>.</p>
<h2>Часті фрази</h2>
<ul>
<li><strong>is not defined</strong> — змінну не оголошено.</li>
<li><strong>is not a function</strong> — намагаєтеся викликати те, що не є функцією.</li>
<li><strong>unexpected token</strong> — синтаксична помилка, зайвий або пропущений символ.</li>
<li><strong>permission denied</strong> — недостатньо прав.</li>
<li><strong>connection refused</strong> — сервер не приймає з'єднання (не запущений або інший порт).</li>
<li><strong>timed out</strong> — час очікування вичерпано.</li>
</ul>
<h2>Як шукати рішення</h2>
<p>Скопіюйте ключову частину повідомлення без ваших власних назв файлів і змінних та шукайте англійською — відповідей буде набагато більше. Читайте stack trace зверху вниз: перший рядок з вашим файлом зазвичай і є місцем проблеми.</p>`,
            test: {
              title: 'Тест: читання документації',
              timeLimit: 10,
              questions: [
                {
                  text: 'Що означає deprecated?',
                  type: 'SINGLE',
                  answers: [['Застарілий, буде видалений', true], ['Обов\'язковий', false], ['Новий експериментальний', false]],
                },
                {
                  text: 'Що означає MUST у специфікаціях RFC?',
                  type: 'SINGLE',
                  answers: [['Обов\'язкова вимога', true], ['Рекомендація', false], ['На розсуд розробника', false]],
                },
                {
                  text: 'Що означає connection refused?',
                  type: 'SINGLE',
                  answers: [['Сервер не приймає з\'єднання', true], ['Недостатньо прав', false], ['Синтаксична помилка', false]],
                },
                {
                  text: 'Які слова означають параметри функції за обов\'язковістю?',
                  type: 'MULTIPLE',
                  answers: [['required', true], ['optional', true], ['deprecated', false]],
                },
              ],
            },
          },
        ],
      },
      {
        title: 'Комунікація в команді',
        lessons: [
          {
            title: 'Стендапи та статуси',
            content: `<h2>Формат щоденного стендапу</h2>
<p>На стендапі кожен коротко відповідає на три питання:</p>
<ol>
<li><strong>Yesterday I</strong> finished the certificate page.</li>
<li><strong>Today I'm going to</strong> work on email notifications.</li>
<li><strong>I'm blocked by</strong> the missing API endpoint. / <strong>No blockers.</strong></li>
</ol>
<h2>Корисні фрази</h2>
<ul>
<li><em>I'm still working on...</em> — я ще працюю над...</li>
<li><em>It's taking longer than expected because...</em> — це займає більше часу, бо...</li>
<li><em>Could you take a look at my PR?</em> — можеш переглянути мій PR?</li>
<li><em>Let's discuss it after the stand-up.</em> — обговорімо після стендапу.</li>
<li><em>I'll keep you posted.</em> — я триматиму в курсі.</li>
</ul>
<h2>Часи дієслів у статусах</h2>
<p>Про завершене вчора — <strong>Past Simple</strong>: <em>I fixed the bug</em>. Про процес, що триває, — <strong>Present Continuous</strong>: <em>I'm refactoring the tests</em>. Про результат, важливий зараз, — <strong>Present Perfect</strong>: <em>I've already deployed the fix</em>.</p>
<p>Говоріть коротко: стендап — не звіт про кожну годину, а синхронізація, щоб команда знала про прогрес і проблеми.</p>`,
          },
          {
            title: 'Листи та коментарі в code review',
            content: `<h2>Структура робочого листа</h2>
<ul>
<li><strong>Subject</strong> — конкретна тема: <em>Question about the payment API</em>, а не <em>Question</em>.</li>
<li><strong>Привітання</strong>: <em>Hi Andrii,</em></li>
<li><strong>Суть у першому реченні</strong>: <em>I'd like to clarify how refunds work.</em></li>
<li><strong>Деталі</strong> — коротко, списком, якщо пунктів кілька.</li>
<li><strong>Наступний крок</strong>: <em>Could you reply by Friday?</em></li>
<li><strong>Завершення</strong>: <em>Thanks, Olena</em> або <em>Best regards, Olena</em>.</li>
</ul>
<h2>Ввічливі коментарі в рев'ю</h2>
<p>Пропонуйте, а не наказуйте:</p>
<ul>
<li><em>Could we extract this into a separate function?</em></li>
<li><em>What do you think about using a Map here?</em></li>
<li><em>Nit: a typo in the variable name.</em> — <strong>nit</strong> (від nitpick) позначає дрібне зауваження, яке не блокує злиття.</li>
<li><em>LGTM</em> — <em>looks good to me</em>, схвалення змін.</li>
</ul>
<h2>Скорочення, які варто знати</h2>
<p><strong>ASAP</strong> — якнайшвидше, <strong>FYI</strong> — до відома, <strong>WIP</strong> — робота в процесі, <strong>ETA</strong> — очікуваний час завершення, <strong>PTAL</strong> — please take a look.</p>`,
            test: {
              title: 'Тест: комунікація в команді',
              timeLimit: 10,
              questions: [
                {
                  text: 'Що означає LGTM у code review?',
                  type: 'SINGLE',
                  answers: [['Looks good to me — схвалення', true], ['Let\'s go to meeting', false], ['Low global test metric', false]],
                },
                {
                  text: 'Який час використати для «Я вже задеплоїла виправлення»?',
                  type: 'SINGLE',
                  answers: [['Present Perfect', true], ['Past Continuous', false], ['Future Simple', false]],
                },
                {
                  text: 'Що означає позначка nit у коментарі?',
                  type: 'SINGLE',
                  answers: [['Дрібне зауваження, що не блокує злиття', true], ['Критична помилка', false], ['Новий запит на функцію', false]],
                },
                {
                  text: 'Які скорочення правильно розшифровано?',
                  type: 'MULTIPLE',
                  answers: [['FYI — до відома', true], ['WIP — робота в процесі', true], ['ETA — очікуваний час завершення', true], ['ASAP — після обіду', false]],
                },
              ],
            },
          },
        ],
      },
    ],
  },

  // ───────────────────────────── Чернетка ─────────────────────────────
  {
    key: 'algo',
    title: 'Алгоритми та структури даних',
    description: 'Чернетка курсу: складність алгоритмів, базові структури даних і сортування.',
    category: 'Програмування',
    level: 'ADVANCED',
    price: 0,
    autoApprove: false,
    published: false,
    teacher: 'teacher1',
    sections: [
      {
        title: 'Складність алгоритмів',
        lessons: [
          {
            title: 'Нотація Big O',
            content: `<h2>Як швидко росте час роботи</h2>
<p>Big O описує, як змінюється кількість операцій алгоритму зі зростанням розміру вхідних даних <code>n</code>, ігноруючи константи.</p>
<ul>
<li><code>O(1)</code> — доступ до елемента масиву за індексом.</li>
<li><code>O(log n)</code> — бінарний пошук у відсортованому масиві.</li>
<li><code>O(n)</code> — перегляд усіх елементів.</li>
<li><code>O(n log n)</code> — ефективні сортування (merge sort).</li>
<li><code>O(n²)</code> — вкладені цикли, наприклад сортування бульбашкою.</li>
</ul>
<p>Для мільйона елементів різниця між <code>O(n log n)</code> і <code>O(n²)</code> — це секунди проти годин.</p>`,
          },
          {
            title: 'Масиви та зв\'язні списки',
            content: `<h2>Два способи зберігати послідовність</h2>
<p><strong>Масив</strong> зберігає елементи підряд у пам'яті: доступ за індексом — <code>O(1)</code>, але вставка в середину — <code>O(n)</code>, бо треба зсунути решту елементів.</p>
<p><strong>Зв'язний список</strong> зберігає вузли, кожен з яких посилається на наступний: вставка після відомого вузла — <code>O(1)</code>, а доступ до k-го елемента — <code>O(n)</code>.</p>
<p>На практиці масиви часто швидші завдяки кешу процесора, тому списки використовують там, де справді багато вставок і видалень.</p>`,
          },
        ],
      },
    ],
  },
]
