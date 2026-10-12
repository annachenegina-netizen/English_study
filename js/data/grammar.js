// Темы по грамматике. По две на уровень, идут строго по порядку.
// order     — задания «собери предложение из слов» (проверяются в браузере, без ИИ)
// translate — задания на перевод (проверяет ИИ)
// В order поле en пишем без точки и вопросительного знака в конце.

// Справка по частым ошибкам, которых нет среди тем курса.
// Показывается по кнопке «Справка» под разбором ошибки.
export const EXTRA_RULES = {
  my_your: {
    title: 'you — ты, your — твой',
    forAi: 'wrong pronoun form: you/your, I/my/me, he/his/him, she/her, we/our/us, they/their/them',
    html: `
      <p>В русском «ты» и «твой» — разные слова. В английском тоже: <b>you</b> — ты, <b>your</b> — твой.</p>
      <p>Перед вещью всегда стоит слово из колонки «чей».</p>
      <table class="mini">
        <tr><th>кто</th><th>чей</th><th>кого / кому</th></tr>
        <tr><td>I — я</td><td><b>my</b> — мой</td><td>me — меня, мне</td></tr>
        <tr><td>you — ты</td><td><b>your</b> — твой</td><td>you — тебя, тебе</td></tr>
        <tr><td>he — он</td><td><b>his</b> — его</td><td>him — его, ему</td></tr>
        <tr><td>she — она</td><td><b>her</b> — её</td><td>her — её, ей</td></tr>
        <tr><td>we — мы</td><td><b>our</b> — наш</td><td>us — нас, нам</td></tr>
        <tr><td>they — они</td><td><b>their</b> — их</td><td>them — их, им</td></tr>
      </table>
      <ul>
        <li>I take <b>your</b> car. — Я беру <b>твою</b> машину.</li>
        <li>I see <b>you</b>. — Я вижу <b>тебя</b>.</li>
        <li>He helps <b>me</b>. — Он помогает <b>мне</b>.</li>
      </ul>
      <p class="trap">Проверка: переведи слово на русский. «Ты машина» звучит криво — значит нужно «твоя», your.</p>`,
  },
  spelling: {
    title: 'Опечатка',
    forAi: 'only a spelling mistake or typo, grammar is fine',
    html: `<p>Грамматика тут в порядке, ошибка только в написании слова. Посмотри на подсвеченное слово и запомни, как оно пишется.</p>`,
  },
  to_verb: {
    title: 'to между двумя действиями',
    forAi: 'missing "to" between two verbs: want to go, need to buy, like to read',
    html: `
      <p>«Хочу <b>курить</b>», «надо <b>купить</b>», «люблю <b>читать</b>» — второе действие в русском кончается на «-ть». В английском вместо «-ть» перед ним ставится <b>to</b>.</p>
      <p class="formula">want / need / like + to + действие</p>
      <ul>
        <li>I want <b>to</b> sleep. — Я хочу спать.</li>
        <li>I need <b>to</b> go. — Мне надо идти.</li>
      </ul>
      <p><b>Когда to не нужно:</b> после can и will — I can swim. I will call.</p>
      <p><b>И не нужно перед вещью:</b> I want coffee. — тут нет второго действия.</p>`,
  },
  plural: {
    title: 'Несколько штук: -s на конце',
    forAi: 'missing or wrong plural -s: two cars, many friends',
    html: `
      <p>Когда вещей больше одной, к слову добавляется <b>-s</b>.</p>
      <p class="formula">один: a car · несколько: cars</p>
      <ul>
        <li>I have two friend<b>s</b>. — У меня два друга.</li>
        <li>There are many room<b>s</b>. — Тут много комнат.</li>
      </ul>
      <p><b>Когда -s не нужно:</b> то, что не считают поштучно — water, money, coffee, time.</p>
      <p><b>Особые слова:</b> man → men, person → people, child → children.</p>`,
  },
  prep: {
    title: 'in, at, on, to — маленькие слова места',
    forAi: 'wrong or missing preposition of place or time: in, at, on, to',
    html: `
      <p>В русском одно «в» на всё. В английском их несколько.</p>
      <ul>
        <li><b>in</b> — внутри, в городе, стране: in Berlin, in the room.</li>
        <li><b>at</b> — в точке, «на месте»: at home, at work, at school.</li>
        <li><b>on</b> — на поверхности и про дни: on the table, on Monday.</li>
        <li><b>to</b> — движение куда-то: I go <b>to</b> work.</li>
      </ul>
      <p><b>Время:</b> at 9 o'clock · on Monday · in the morning · in May.</p>
      <p class="trap">Ловушка: «домой» — просто home, без to: I go home.</p>`,
  },
};

// Английские названия тем — их получает ИИ в чате, чтобы знать, какой грамматикой можно пользоваться
export const TOPIC_NAMES_EN = {
  be: 'to be: am / is / are (statements, negatives, questions)',
  svo: 'basic word order: subject - verb - object',
  ps: 'Present Simple statements (he works)',
  psq: 'Present Simple negatives and questions with do / does',
  art: 'articles a / an / the',
  there: 'there is / there are',
  cont: 'Present Continuous (I am working)',
  can: "can / can't",
  wh: 'questions with what, where, when, why, how',
  adv: 'always / usually / often / sometimes / never; place before time',
  past: 'Past Simple: -ed, common irregular verbs, was / were, did',
  fut: 'future with will and be going to',
};

export const TOPICS = [
  {
    id: 'be',
    level: 1,
    title: 'am / is / are',
    html: `
      <p>В русском можно сказать «Я дома» — глагола нет. В английском <b>так нельзя</b>: в каждом предложении должен быть глагол. Если действия нет, ставим <b>am / is / are</b>.</p>
      <ul>
        <li><b>I am</b> — I am at home.</li>
        <li><b>he / she / it is</b> — She is busy.</li>
        <li><b>you / we / they are</b> — We are friends.</li>
      </ul>
      <p><b>«Не»:</b> добавь not после — I am <b>not</b> busy.</p>
      <p><b>Вопрос:</b> am/is/are переезжает в начало — <b>Are</b> you busy?</p>
      <p class="trap">Ловушка: «Он врач» → He <b>is</b> a doctor. Без is — ошибка.</p>`,
    order: [
      { ru: 'Я менеджер.', en: 'I am a manager' },
      { ru: 'Она дома.', en: 'She is at home' },
      { ru: 'Мы не заняты.', en: 'We are not busy' },
      { ru: 'Ты готов?', en: 'Are you ready' },
    ],
    translate: ['Он мой друг.', 'Они в офисе.', 'Я не устал.', 'Она врач?'],
  },
  {
    id: 'svo',
    level: 1,
    title: 'Порядок слов: кто → делает → что',
    html: `
      <p>В русском слова можно ставить как угодно: «Я люблю кофе», «Кофе я люблю», «Люблю я кофе». Смысл понятен по окончаниям.</p>
      <p>В английском окончаний почти нет, поэтому смысл держится на <b>порядке</b>. Он всегда один:</p>
      <p class="formula">КТО → ДЕЛАЕТ → ЧТО</p>
      <ul>
        <li>I like coffee.</li>
        <li>We have a car.</li>
        <li>They need help.</li>
      </ul>
      <p class="trap">Ловушка: «Кофе я люблю» нельзя перевести как «Coffee I like». Сначала перестрой в голове: «Я люблю кофе» → I like coffee.</p>`,
    order: [
      { ru: 'Я люблю кофе.', en: 'I like coffee' },
      { ru: 'У нас большой дом.', en: 'We have a big house' },
      { ru: 'Им нужна помощь.', en: 'They need help' },
      { ru: 'Твоего друга я знаю.', en: 'I know your friend' },
    ],
    translate: ['Музыку я люблю.', 'Мы хотим пиццу.', 'Этот фильм я знаю.', 'Время у меня есть.'],
  },
  {
    id: 'ps',
    level: 2,
    title: 'Обычные действия: he works',
    html: `
      <p>Когда говоришь о том, что происходит <b>обычно, регулярно, всегда</b>, глагол стоит в простой форме: I work, we live, they like.</p>
      <p>Одно исключение: после <b>he / she / it</b> (и любого «он/она/оно» — my friend, the client) к глаголу добавляется <b>-s</b>.</p>
      <ul>
        <li>I work → He work<b>s</b></li>
        <li>We live → She live<b>s</b></li>
        <li>I have → He <b>has</b> (особый случай)</li>
        <li>I go → She go<b>es</b></li>
      </ul>
      <p class="trap">Ловушка: -s забывают все. Проверяй себя: один человек и это не «я» и не «ты»? Значит -s.</p>`,
    order: [
      { ru: 'Она работает в банке.', en: 'She works in a bank' },
      { ru: 'Ему нравится его работа.', en: 'He likes his job' },
      { ru: 'Мой друг живёт в Берлине.', en: 'My friend lives in Berlin' },
      { ru: 'Я работаю каждый день.', en: 'I work every day' },
    ],
    translate: ['Она живёт в Лондоне.', 'Он хочет кофе.', 'Мы работаем каждый день.', 'У моего друга новая работа.'],
  },
  {
    id: 'psq',
    level: 2,
    title: '«Не» и вопросы: do / does',
    html: `
      <p>В русском «не» просто ставится перед глаголом: «я не знаю». В английском нужен помощник <b>do</b> (для he/she/it — <b>does</b>).</p>
      <p class="formula">I do not know · He does not know</p>
      <p>В речи почти всегда коротко: <b>don't</b> и <b>doesn't</b>.</p>
      <p><b>Вопрос:</b> тот же помощник встаёт в начало.</p>
      <p class="formula">Do you know? · Does he know?</p>
      <p class="trap">Ловушка: когда есть does, -s с глагола уходит. He doesn't work<s>s</s>. Does she live<s>s</s> here? Буква -s уже сидит в does.</p>
      <p>С am/is/are помощник не нужен: I am not busy. Are you busy?</p>`,
    order: [
      { ru: 'Я не люблю чай.', en: 'I do not like tea' },
      { ru: 'Она здесь не работает.', en: 'She does not work here' },
      { ru: 'Ты живёшь в Москве?', en: 'Do you live in Moscow' },
      { ru: 'Он знает твоего друга?', en: 'Does he know your friend' },
    ],
    translate: ['Я не знаю.', 'Он не работает сегодня.', 'Ты любишь кофе?', 'Она живёт здесь?'],
  },
  {
    id: 'art',
    level: 3,
    title: 'a / an / the',
    html: `
      <p>В русском этого нет вообще, поэтому просто запомни три случая.</p>
      <ul>
        <li><b>a</b> — «какой-то, один из». Говоришь о вещи впервые: I have <b>a</b> car.</li>
        <li><b>the</b> — «тот самый». Оба понимаете, о чём речь: <b>The</b> car is new.</li>
        <li><b>an</b> — то же, что a, но перед гласным звуком: <b>an</b> idea, <b>an</b> old house.</li>
      </ul>
      <p>Профессия и «какой он» — всегда с a: He is <b>a</b> manager. It is <b>a</b> good idea.</p>
      <p><b>Когда не ставить ничего:</b></p>
      <ul>
        <li>напитки, еда, вещества: I want coffee. I like tea. I need water.</li>
        <li>имена, города, страны, языки: I live in Berlin. I speak English.</li>
        <li>несколько штук «вообще»: I like cars.</li>
        <li>перед my / your / his / this: my car, this idea.</li>
      </ul>
      <p class="trap">Ловушка: одна штука, которую можно посчитать, не бывает «голой». Не «I have car», а «I have a car». Проверка: можно подставить «какой-то» или «тот самый»? Значит нужен a или the.</p>`,
    order: [
      { ru: 'У меня новая работа.', en: 'I have a new job' },
      { ru: 'Эта работа очень хорошая.', en: 'The job is very good' },
      { ru: 'Она хороший друг.', en: 'She is a good friend' },
      { ru: 'Он живёт в старом доме.', en: 'He lives in an old house' },
    ],
    translate: ['У меня есть машина.', 'Он хороший менеджер.', 'Я хочу яблоко.', 'У меня есть идея.'],
  },
  {
    id: 'there',
    level: 3,
    title: 'there is / there are — «где-то есть что-то»',
    html: `
      <p>Русское «В комнате есть стол» начинается с места. В английском такое предложение начинается с <b>there is</b> (одна вещь) или <b>there are</b> (несколько), а место уходит в конец.</p>
      <p class="formula">There is + ЧТО + ГДЕ</p>
      <ul>
        <li>There is a table in the room.</li>
        <li>There are two cafes near my house.</li>
      </ul>
      <p><b>Вопрос:</b> Is there a bank near here?</p>
      <p><b>«Нет»:</b> There is no water. There are no people.</p>
      <p class="trap">Ловушка: не переводи дословно «In the room is a table». Начинай с there is.</p>`,
    order: [
      { ru: 'Рядом с моим домом есть кафе.', en: 'There is a cafe near my house' },
      { ru: 'Здесь много людей.', en: 'There are many people here' },
      { ru: 'Здесь рядом есть банк?', en: 'Is there a bank near here' },
      { ru: 'В комнате нет воды.', en: 'There is no water in the room' },
    ],
    translate: ['В комнате есть стол.', 'В городе много людей.', 'Здесь есть кафе?', 'В моём доме две комнаты.'],
  },
  {
    id: 'cont',
    level: 4,
    title: 'Прямо сейчас: I am working',
    html: `
      <p>В русском «я работаю» значит и «вообще работаю», и «работаю сию минуту». В английском это <b>две разные формы</b>.</p>
      <ul>
        <li>Обычно, вообще: I <b>work</b> at home.</li>
        <li>Прямо сейчас: I <b>am working</b>.</li>
      </ul>
      <p class="formula">am / is / are + глагол с -ing</p>
      <p><b>«Не»:</b> I am <b>not</b> working. <b>Вопрос:</b> <b>Are</b> you working?</p>
      <p class="trap">Ловушка: забывают am/is/are. «I working» — ошибка. Нужны обе части: и am, и -ing.</p>`,
    order: [
      { ru: 'Я сейчас работаю.', en: 'I am working now' },
      { ru: 'Она читает книгу.', en: 'She is reading a book' },
      { ru: 'Мы не ждём.', en: 'We are not waiting' },
      { ru: 'Ты учишь английский?', en: 'Are you learning English' },
    ],
    translate: ['Я сейчас ем.', 'Он пишет сообщение.', 'Они сейчас не работают.', 'Что ты делаешь?'],
  },
  {
    id: 'can',
    level: 4,
    title: 'can — могу, умею',
    html: `
      <p><b>can</b> — «могу» и «умею». Самое простое слово в английском: оно никогда не меняется.</p>
      <p class="formula">КТО + can + глагол</p>
      <ul>
        <li>I can help. She can help. They can help.</li>
        <li><b>«Не»:</b> I <b>can't</b> come today.</li>
        <li><b>Вопрос:</b> <b>Can</b> you help me?</li>
      </ul>
      <p class="trap">Ловушка: после can глагол голый. Не «can to help» и не «she cans», а «She can help».</p>
      <p>Can you…? — обычный вежливый способ попросить: Can you send me the file?</p>`,
    order: [
      { ru: 'Я говорю по-английски (умею).', en: 'I can speak English' },
      { ru: 'Он не может нам помочь.', en: "He can't help us" },
      { ru: 'Можешь мне помочь?', en: 'Can you help me' },
      { ru: 'Мы можем встретиться завтра.', en: 'We can meet tomorrow' },
    ],
    translate: ['Я умею плавать.', 'Ты можешь подождать?', 'Он не может прийти.', 'Мы можем начать сейчас.'],
  },
  {
    id: 'wh',
    level: 5,
    title: 'Вопросы: what, where, when, why, how',
    html: `
      <p>Вопросительное слово всегда стоит <b>первым</b>, а дальше идёт обычный вопрос, который ты уже умеешь строить.</p>
      <p class="formula">СЛОВО + do/does + КТО + глагол</p>
      <ul>
        <li><b>Where</b> do you live?</li>
        <li><b>What</b> does she do?</li>
        <li><b>When</b> do you start work?</li>
      </ul>
      <p>С am/is/are — без do: <b>Why</b> are you late? <b>Where</b> is he?</p>
      <p class="trap">Ловушка: «Где ты живёшь?» → «Where you live?» — так говорят все русские, и это ошибка. Между where и you обязательно do.</p>`,
    order: [
      { ru: 'Где ты живёшь?', en: 'Where do you live' },
      { ru: 'Чем она занимается?', en: 'What does she do' },
      { ru: 'Почему ты опоздал?', en: 'Why are you late' },
      { ru: 'Когда ты начинаешь работу?', en: 'When do you start work' },
    ],
    translate: ['Где ты работаешь?', 'Что ты хочешь?', 'Почему он не дома?', 'Как тебя зовут?'],
  },
  {
    id: 'adv',
    level: 5,
    title: 'Куда ставить always, often и «где — когда»',
    html: `
      <p>Два правила, которые сразу делают речь похожей на английскую.</p>
      <p><b>1. Слова «как часто»</b> (always, usually, often, sometimes, never) стоят <b>перед глаголом</b>:</p>
      <ul>
        <li>I <b>always</b> drink coffee.</li>
        <li>He <b>never</b> eats meat.</li>
      </ul>
      <p>Но <b>после</b> am/is/are: She is <b>often</b> late.</p>
      <p><b>2. В конце предложения сначала «где», потом «когда»:</b></p>
      <p class="formula">КТО → ДЕЛАЕТ → ЧТО → ГДЕ → КОГДА</p>
      <ul><li>We meet in the office every Monday.</li></ul>
      <p class="trap">Ловушка: never уже значит «никогда не». Второе «не» не нужно: I never drink coffee, а не «I don't never drink».</p>`,
    order: [
      { ru: 'Я всегда пью кофе утром.', en: 'I always drink coffee in the morning' },
      { ru: 'Она часто опаздывает.', en: 'She is often late' },
      { ru: 'Мы встречаемся в офисе каждый понедельник.', en: 'We meet in the office every Monday' },
      { ru: 'Он никогда не ест мясо.', en: 'He never eats meat' },
    ],
    translate: ['Я обычно работаю дома.', 'Он всегда занят.', 'Мы обедаем в офисе каждый день.', 'Она никогда не опаздывает.'],
  },
  {
    id: 'past',
    level: 6,
    title: 'Прошлое: worked, was, did',
    html: `
      <p>Чтобы сказать о прошлом, к глаголу добавляем <b>-ed</b>: work → work<b>ed</b>, call → call<b>ed</b>. Форма одна для всех, -s не нужна.</p>
      <p>Частые глаголы меняются по-своему, их надо просто запомнить: go → <b>went</b>, have → <b>had</b>, see → <b>saw</b>, buy → <b>bought</b>, send → <b>sent</b>.</p>
      <p>am/is → <b>was</b>, are → <b>were</b>: I was busy. We were at home.</p>
      <p><b>«Не» и вопрос</b> — через помощника <b>did</b>:</p>
      <p class="formula">I did not go · Did you go?</p>
      <p class="trap">Ловушка: с did глагол возвращается в обычную форму. «I didn't went» — ошибка, правильно «I didn't go». Прошлое уже сидит в did.</p>`,
    order: [
      { ru: 'Я работал вчера.', en: 'I worked yesterday' },
      { ru: 'Она была дома.', en: 'She was at home' },
      { ru: 'Мы не пошли на встречу.', en: 'We did not go to the meeting' },
      { ru: 'Ты видел моё письмо?', en: 'Did you see my email' },
    ],
    translate: ['Я был занят вчера.', 'Мы купили новую машину.', 'Он не позвонил.', 'Ты закончил задачу?'],
  },
  {
    id: 'fut',
    level: 6,
    title: 'Будущее: will и going to',
    html: `
      <p>Два способа сказать о будущем. Оба простые.</p>
      <ul>
        <li><b>will</b> — решил только что, обещаешь или предполагаешь: I <b>will</b> call you. В речи коротко: <b>I'll</b> call you.</li>
        <li><b>am/is/are going to</b> — уже есть план: I <b>am going to</b> change my job.</li>
      </ul>
      <p><b>«Не»:</b> I <b>won't</b> be late (won't = will not).</p>
      <p><b>Вопрос:</b> <b>Will</b> you help me?</p>
      <p class="trap">Ловушка: после will глагол голый, как после can. Не «will to call» и не «he will calls». А «буду дома» — это will <b>be</b> at home: be нельзя пропускать.</p>`,
    order: [
      { ru: 'Я позвоню тебе завтра.', en: 'I will call you tomorrow' },
      { ru: 'Она собирается сменить работу.', en: 'She is going to change her job' },
      { ru: 'Мы не опоздаем.', en: 'We will not be late' },
      { ru: 'Ты мне поможешь?', en: 'Will you help me' },
    ],
    translate: ['Я помогу тебе.', 'Мы собираемся купить дом.', 'Он не придёт завтра.', 'Ты будешь дома вечером?'],
  },
];
