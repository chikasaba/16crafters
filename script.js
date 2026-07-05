/* ==========================================================================
   マイクラ活動スタイル診断 - ロジック
   構成:
     1. 設定 / 多言語文字列 (拡張ポイント)
     2. 軸データ定義
     3. 質問データ定義 (拡張ポイント: 自由に追加・削除可)
     4. タイプ(診断結果)データ定義 (拡張ポイント: 説明文・画像を追加可)
     5. 状態管理 (state)
     6. スコア計算 / タイプ判定ロジック
     7. 画面描画 (render)
     8. イベントハンドラ
     9. URL共有 / 初期化
   ========================================================================== */

(() => {
  'use strict';

  /* ------------------------------------------------------------------
   * 1. 設定 / 多言語文字列
   *    - CONFIG.shuffleQuestions を true にすると質問順をシャッフル可能。
   *    - UI_TEXT はここに言語キーを追加するだけで多言語対応を拡張できる。
   * ------------------------------------------------------------------ */
  const CONFIG = {
    shuffleQuestions: true, // 拡張ポイント: true にすると出題順がランダムになる
  };

  const currentLang = 'ja'; // 拡張ポイント: 将来的にユーザー設定等から切り替え可能にする

  const UI_TEXT = {
    ja: {
      progressLabel: (current, total) => `Q${current} / ${total}`,
      copySuccess: 'URLをコピーしました！',
      copyFailure: 'コピーに失敗しました。手動でURLをコピーしてください。',
      shareXText: (typeName) => `マイクラ活動スタイル診断で「${typeName}」タイプでした！`,
    },
  };
  const t = UI_TEXT[currentLang];

  // 選択肢を選んでから次の質問へ自動で切り替わるまでの待機時間(ミリ秒)
  const AUTO_ADVANCE_DELAY = 100;

  /* ------------------------------------------------------------------
   * 2. 軸データ定義
   *    id         : 内部識別子 (questions[].axis と対応させる)
   *    left/right : 各極の { code(1文字), label(表示名), desc(説明) }
   *    スコアが 0 以上なら left、負なら right 側の性質が強いと判定する。
   * ------------------------------------------------------------------ */
  const AXES = [
    {
      id: 'settlement',
      left: { code: 'N', label: '探索/Nomad', desc: '拠点に縛られず、様々な土地を渡り歩く' },
      right: { code: 'H', label: '定住/Home', desc: '一つの拠点を「育てる」ことに重きを置く' },
    },
    {
      id: 'aesthetics',
      left: { code: 'D', label: '美観/Design', desc: '景観・世界観・デザインを重視する' },
      right: { code: 'E', label: '効率/Efficiency', desc: '利便性・生産性・機能性を重視する' },
    },
    {
      id: 'social',
      left: { code: 'C', label: '共同/Co-Op', desc: '他プレイヤーとの協力・共同作業を好む' },
      right: { code: 'S', label: '孤立/Solo', desc: '自分のペースで、自分の世界を作りたい' },
    },
    {
      id: 'planning',
      left: { code: 'P', label: '計画/Plan', desc: '事前に構想を立て、段階的に実行する' },
      right: { code: 'I', label: '発想/Idea', desc: 'その場の景観や気分で建築や行動を決める' },
    },
  ];

  /* ------------------------------------------------------------------
   * 3. 質問データ定義
   *    text    : 質問文
   *    axis    : 対象軸の id (AXES の id と対応)
   *    reverse : true の場合、回答スコアを反転してから加算する（逆転項目）
   *
   *    拡張ポイント: この配列に { text, axis, reverse } を追加/削除するだけで
   *    質問数を自由に変更できる。1軸あたりの問題数が偏っても動作するが、
   *    バランスを取るなら各軸で同数にするのが望ましい。
   * ------------------------------------------------------------------ */
  const QUESTIONS = [
    // --- 探索(Nomad) / 定住(Home) ---
    { text: '一つの拠点を長い時間をかけて発展させる遊び方が好きだ', axis: 'settlement', reverse: true },
    { text: '拠点を離れ、長旅をするのは苦にならない', axis: 'settlement', reverse: false },
    { text: '新しい土地を探すより、今ある拠点をさらに便利にしたいと思う。', axis: 'settlement', reverse: true },
    { text: '拠点とは、遠征のための荷物置き場である', axis: 'settlement', reverse: false },
    { text: 'ワールドを思い返すとき、一番印象に残るのは旅ではなく自分の拠点だ', axis: 'settlement', reverse: true },
    { text: '一つの場所に留まるより、次々と新しい土地へ拠点を作りたい', axis: 'settlement', reverse: false },

    // --- 美観(Design) / 効率(Efficiency) ---
    { text: '作業効率が多少落ちても、外観が良くなる設計のほうがよい', axis: 'aesthetics', reverse: false },
    { text: '建築は見た目よりも使いやすさを優先したい', axis: 'aesthetics', reverse: true },
    { text: '街並みや景観にこだわり、統一感を大事にする', axis: 'aesthetics', reverse: false },
    { text: '移動距離や動線を短くできるなら、多少景観が崩れても構わない', axis: 'aesthetics', reverse: true },
    { text: '機能がほとんどなくても、景観のためだけの建築を作ることがある', axis: 'aesthetics', reverse: false },
    { text: '建築では、家よりも装置を充実させることに達成感を覚える', axis: 'aesthetics', reverse: true },

    // --- 共同(Co-op) / 孤立(Solo) ---
    { text: '大きな建築は、一人で作るより誰かと協力して完成させたい', axis: 'social', reverse: false },
    { text: 'マルチプレイでも、自分のペースで一人で進めたい', axis: 'social', reverse: true },
    { text: '他のプレイヤーと資源や設備を共有することに楽しさを感じる', axis: 'social', reverse: false },
    { text: '自分の建築や拠点は、自分だけの判断で自由に作りたい', axis: 'social', reverse: true },
    { text: '一人で達成するより、みんなで目標を達成した方が嬉しい', axis: 'social', reverse: false },
    { text: '誰にも気を遣わず、自分のペースだけで遊べる環境を好む', axis: 'social', reverse: true },

    // --- 計画(Plan) / 発想(Idea) ---
    { text: '建築を始める前に、おおまかな完成形を考えてから作業することが多い', axis: 'planning', reverse: false },
    { text: '建築中のアイデアで、最初の予定を変えることがよくある', axis: 'planning', reverse: true },
    { text: '必要な資材を事前に揃えてから建築を始めたい', axis: 'planning', reverse: false },
    { text: '地形や景色を見ながら、その場で建築内容を決める方が好きだ', axis: 'planning', reverse: true },
    { text: '大規模な建築は、工程を分けて順番に進める方が性に合っている', axis: 'planning', reverse: false },
    { text: '完成形が決まっていなくても、とりあえず作り始めることが多い', axis: 'planning', reverse: true },
  ];

  /* 回答選択肢: 5段階評価とスコアの対応 */
  const ANSWER_OPTIONS = [
    { label: 'とてもそう思う', score: 2 },
    { label: 'ややそう思う', score: 1 },
    { label: 'どちらともいえない', score: 0 },
    { label: 'あまりそう思わない', score: -1 },
    { label: '全くそう思わない', score: -2 },
  ];

  /* ------------------------------------------------------------------
   * 4. タイプ(診断結果)データ定義
   *    key: AXES の順番で left/right のコードを連結した4文字 (例: "XACP")
   *    拡張ポイント: 各タイプに image プロパティ (画像URL) を追加すれば
   *    render 側が自動的に画像を表示する（下記 renderResult 参照）。
   * ------------------------------------------------------------------ */
  const TYPE_DATA = {
    NDCP: {
      name: '偉大なる航海者',
      image: null,
      description: '新天地を求めて突き進みながらも、行く先々の景色や街づくりにこだわりを持つ。仲間と共に大きな目標へ向かって、しっかり計画を練ってから冒険に出るタイプ。',
      traits: [
        '遠征前にルートや装備をしっかり準備する',
        '発見した土地に美しい拠点や道標を残す',
        '仲間と役割分担しながら大規模な遠征を成功させる',
      ],
    },
    NDCI: {
      name: '放浪の画家',
      image: null,
      description: '思い立ったらすぐ冒険に出る自由人。美しい景色に出会うたびに寄り道し、出会った人とはすぐ打ち解けられる。計画よりもその場のひらめきを大切にする。',
      traits: [
        '綺麗な景色を見つけると、その場で建築を始める',
        '仲間を巻き込んで思いつきの冒険を企画する',
        '準備不足でも、なんとかなると笑って進む',
      ],
    },
    NDSP: {
      name: '孤高の設計者',
      image: null,
      description: '誰の手も借りず、自分だけで新天地を切り拓く。事前にしっかり構想を練り、理想の景観を実現するために単独行動を好む。',
      traits: [
        '一人でじっくり土地を選び、設計図を描いてから着手する',
        '景観を損なわないよう、細部までこだわり抜く',
        '干渉されない環境で自分の世界観を追求する',
      ],
    },
    NDSI: {
      name: '吟遊詩人',
      image: null,
      description: '気の向くままに旅をし、美しい景色に出会えばそこに留まって創作する自由な魂。計画も仲間も必要とせず、自分の感性だけを頼りに世界を巡る。',
      traits: [
        '決まった目的地を持たず、ふらりと旅立つ',
        '心惹かれた景色を、即興でアートに変える',
        '一人の時間の中で創造性を発揮する',
      ],
    },
    NECP: {
      name: '開拓地の指導者',
      image: null,
      description: '新しい土地の資源を効率よく活用するため、仲間と綿密な計画を立てて開拓を進める。実用性を重視した拠点網を各地に築いていく。',
      traits: [
        '資源マップや採掘計画を仲間と共有する',
        '効率的な輸送網や自動化施設を各地に展開する',
        'チームで役割を分担し、開拓のスピードを上げる',
      ],
    },
    NECI: {
      name: '放浪のエンジニア',
      image: null,
      description: 'とにかく前へ進みながら、その場で最適な判断を下していく実践派。仲間と息を合わせ、効率を重視しつつも臨機応変に行動する。',
      traits: [
        '状況に応じて、その場で作戦を変更する',
        '仲間と即興で連携し、無駄なく資源を確保する',
        '立ち止まって考えるより、動きながら考える',
      ],
    },
    NESP: {
      name: '宇宙飛行士',
      image: null,
      description: '単独で新天地を切り拓きながら、常に効率的な動きを追求する。事前準備を怠らず、無駄のない行程で着実に成果を積み上げていく。',
      traits: [
        '一人で採算の取れるルートを綿密に計画する',
        '最短距離で資源や拠点を確保する',
        '誰にも頼らず、自己完結した開拓を進める',
      ],
    },
    NESI: {
      name: '荒野のサバイバー',
      image: null,
      description: 'その日の思いつきで新しい土地に飛び込み、限られた資源で効率よく生き抜く一匹狼。計画は最小限に、経験と勘で乗り切っていく。',
      traits: [
        'とりあえず飛び出してから、対応策を考える',
        '少ない道具で最大の成果を出す工夫をする',
        '誰の指図も受けず、自分のスタイルを貫く',
      ],
    },
    HDCP: {
      name: 'ゼネコンマネージャー',
      image: null,
      description: '仲間と力を合わせ、美しく機能的な街を計画的に育てていくまとめ役。長期的なビジョンを持ち、皆が心地よく過ごせる拠点づくりに情熱を注ぐ。',
      traits: [
        '街全体のデザインコンセプトを仲間と共有する',
        '長期計画を立てて段階的に街を発展させる',
        'みんなの意見をまとめてプロジェクトを推進する',
      ],
    },
    HDCI: {
      name: 'ケーキデコレーター',
      image: null,
      description: '仲間とワイワイしながら、その場のノリで町を彩っていくムードメーカー。計画よりも今この瞬間の楽しさを大切にする。',
      traits: [
        '仲間とアイデアを出し合いながら装飾を進める',
        '思いつきの企画でイベントや建築を盛り上げる',
        '完璧さより、一緒に楽しむ過程を重視する',
      ],
    },
    HDSP: {
      name: '孤高の建築家',
      image: null,
      description: '自分だけの美学に基づき、じっくりと設計を練ってから理想の建物を作り上げる職人肌。誰にも邪魔されない環境で創作に没頭する。',
      traits: [
        '緻密な設計図を描いてから建築に取り掛かる',
        '妥協せず、美しさを追求し続ける',
        '一人の時間を大切にし、自分のペースを守る',
      ],
    },
    HDSI: {
      name: '気の向くままの庭師',
      image: null,
      description: '拠点の中で、その日の気分に任せて庭や花壇を手入れする自由な創作者。計画は立てず、感性の赴くままに美しい空間を作り上げる。',
      traits: [
        '決まった手順を持たず、思いつきで手を加える',
        '小さな空間を丁寧に、美しく仕上げる',
        '一人静かに創作の時間を楽しむ',
      ],
    },
    HECP: {
      name: '倉庫の番人',
      image: null,
      description: '仲間と協力し、綿密な計画のもとで効率的な拠点運営を行う管理者タイプ。生産ラインや倉庫管理など、裏方の仕組みづくりに長ける。',
      traits: [
        '資材や生産の管理表を作って仲間と共有する',
        '自動化施設を計画的に整備する',
        'チームの生産性を最大化する仕組みを考える',
      ],
    },
    HECI: {
      name: '頼れる現場主任',
      image: null,
      description: '拠点で起きる問題にその場で対応しながら、仲間と協力して効率的に作業を進める実務派。計画よりも臨機応変な判断力が武器。',
      traits: [
        'トラブルが起きても、すぐに仲間と対処する',
        '効率的な作業分担を、その場で采配する',
        '状況に応じて柔軟に方針を変える',
      ],
    },
    HESP: {
      name: '離島の装置勢',
      image: null,
      description: '一人でコツコツと、計画的に生産システムを構築していく効率追求型の職人。自動化や動線設計にこだわり、無駄のない拠点を作り上げる。',
      traits: [
        '一人で綿密な生産計画を立てて実行する',
        '効率的な自動化装置を作り込む',
        '誰にも頼らず、着実に成果を積み上げる',
      ],
    },
    HESI: {
      name: '紅茶中毒者',
      image: null,
      description: '拠点にこもり、思いつきで”便利”な仕掛けや装置を作ってしまう。効率化の鬼でありながら、作るものはどこか常軌を逸している。',
      traits: [
        '思いついたら、すぐに試作を始める',
        '試行錯誤しながら効率的な仕組みを完成させる',
        '一人の作業時間に没頭する',
      ],
    },
  };

  /* ------------------------------------------------------------------
   * 5. 状態管理
   * ------------------------------------------------------------------ */
  const state = {
    questions: CONFIG.shuffleQuestions ? shuffle([...QUESTIONS]) : QUESTIONS,
    currentIndex: 0,
    answers: [], // 各質問のスコア (null = 未回答)
    isTransitioning: false, // 自動遷移の待機中は多重操作を防ぐ
  };
  state.answers = new Array(state.questions.length).fill(null);

  /* 拡張ポイント: 出題順をシャッフルしたい場合に使うユーティリティ */
  function shuffle(array) {
    for (let i = array.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  /* ------------------------------------------------------------------
   * 6. スコア計算 / タイプ判定ロジック
   * ------------------------------------------------------------------ */

  // 各軸の理論上の最大スコア（質問数 × 2点）をあらかじめ計算しておく
  function calcAxisMaxScores(questions) {
    const maxScores = {};
    AXES.forEach((axis) => { maxScores[axis.id] = 0; });
    questions.forEach((q) => { maxScores[q.axis] += 2; });
    return maxScores;
  }

  function calcScores(questions, answers) {
    const scores = {};
    AXES.forEach((axis) => { scores[axis.id] = 0; });

    questions.forEach((q, i) => {
      const rawScore = answers[i];
      if (rawScore === null || rawScore === undefined) return;
      const value = q.reverse ? -rawScore : rawScore;
      scores[q.axis] += value;
    });

    return scores;
  }

  // スコアからタイプコード(4文字)を算出する。0以上ならleft側、負ならright側。
  function calcTypeCode(scores) {
    return AXES.map((axis) => (scores[axis.id] >= 0 ? axis.left.code : axis.right.code)).join('');
  }

  /* ------------------------------------------------------------------
   * 7. 画面描画
   * ------------------------------------------------------------------ */
  const screens = {
    start: document.getElementById('screen-start'),
    quiz: document.getElementById('screen-quiz'),
    result: document.getElementById('screen-result'),
  };

  function showScreen(name) {
    Object.values(screens).forEach((el) => el.classList.remove('is-active'));
    screens[name].classList.add('is-active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const els = {
    btnStart: document.getElementById('btnStart'),
    progressFill: document.getElementById('progressFill'),
    progressTrack: document.getElementById('progressTrack'),
    progressLabel: document.getElementById('progressLabel'),
    questionText: document.getElementById('questionText'),
    answerList: document.getElementById('answerList'),
    btnBack: document.getElementById('btnBack'),
    advancementName: document.getElementById('advancementName'),
    resultCode: document.getElementById('resultCode'),
    resultName: document.getElementById('resultName'),
    resultDesc: document.getElementById('resultDesc'),
    axisBars: document.getElementById('axisBars'),
    traitsList: document.getElementById('traitsList'),
    btnRetry: document.getElementById('btnRetry'),
    btnCopyUrl: document.getElementById('btnCopyUrl'),
    btnShareX: document.getElementById('btnShareX'),
    shareNote: document.getElementById('shareNote'),
  };

  function renderQuestion() {
    const total = state.questions.length;
    const index = state.currentIndex;
    const question = state.questions[index];
    const answered = state.answers[index];

    // 進捗バー・ラベル
    const progressPercent = (index / total) * 100;
    els.progressFill.style.width = `${progressPercent}%`;
    els.progressTrack.setAttribute('aria-valuenow', String(Math.round(progressPercent)));
    els.progressLabel.textContent = t.progressLabel(index + 1, total);

    // 質問文
    els.questionText.textContent = question.text;

    // 選択肢を描画
    els.answerList.innerHTML = '';
    els.answerList.classList.toggle('is-transitioning', state.isTransitioning);
    ANSWER_OPTIONS.forEach((option) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'answer-option';
      btn.textContent = option.label;
      btn.dataset.score = String(option.score);
      if (answered === option.score) {
        btn.classList.add('is-selected');
      }
      btn.addEventListener('click', () => selectAnswer(option.score));
      els.answerList.appendChild(btn);
    });

    // 戻るボタンの状態（先頭の質問、または遷移待機中は操作不可）
    els.btnBack.disabled = index === 0 || state.isTransitioning;
  }

  function renderResultByCode(code) {
    const typeInfo = TYPE_DATA[code];
    if (!typeInfo) return; // 不正なコードの場合は何もしない

    els.advancementName.textContent = typeInfo.name;
    els.resultCode.textContent = code;
    els.resultName.textContent = typeInfo.name;
    els.resultDesc.textContent = typeInfo.description;

    // 特徴リスト
    els.traitsList.innerHTML = '';
    typeInfo.traits.forEach((trait) => {
      const li = document.createElement('li');
      li.textContent = trait;
      els.traitsList.appendChild(li);
    });

    // 拡張ポイント: typeInfo.image がある場合は画像を表示する
    // (現状は未使用のため image が null の場合は何も描画しない)

    showScreen('result');
    updateShareLinks(code, typeInfo.name);
  }

  function renderResultFromAnswers() {
    const scores = calcScores(state.questions, state.answers);
    const maxScores = calcAxisMaxScores(state.questions);
    const code = calcTypeCode(scores);
    const typeInfo = TYPE_DATA[code];
    if (!typeInfo) return;

    renderResultByCode(code);
    renderAxisBars(scores, maxScores);
  }

  // 4軸それぞれの傾向を、中央から左右に振れるバーとして描画する
  function renderAxisBars(scores, maxScores) {
    els.axisBars.innerHTML = '';

    AXES.forEach((axis) => {
      const score = scores[axis.id];
      const maxScore = maxScores[axis.id] || 1;
      const dominant = score >= 0 ? 'left' : 'right';

     // マーカー位置(0-100%)。中央(50%)を基準に左右へ振れる。
    const ratio = Math.max(-1, Math.min(1, score / maxScore));

    // ratio に -1 を掛けることで、プラスとマイナスの方向を反転させる
    const invertedRatio = -ratio; 

    const markerPercent = 50 + invertedRatio * 50;
    const fillLeft = invertedRatio >= 0 ? 50 : markerPercent;
    const fillWidth = Math.abs(markerPercent - 50);

      const wrapper = document.createElement('div');
      wrapper.className = 'axis-bar-item';
      wrapper.innerHTML = `
        <div class="axis-labels">
          <span class="pole ${dominant === 'left' ? 'is-dominant' : ''}">${axis.left.label}(${axis.left.code})</span>
          <span class="pole ${dominant === 'right' ? 'is-dominant' : ''}">${axis.right.label}(${axis.right.code})</span>
        </div>
        <div class="axis-track">
          <span class="axis-center-line"></span>
          <span class="axis-fill" style="left:${fillLeft}%; width:${fillWidth}%;"></span>
          <span class="axis-marker" style="left:${markerPercent}%;"></span>
        </div>
        <div class="axis-score">スコア: ${score > 0 ? '+' : ''}${score} / ±${maxScore}</div>
      `;
      els.axisBars.appendChild(wrapper);
    });
  }

  /* ------------------------------------------------------------------
   * 8. イベントハンドラ
   * ------------------------------------------------------------------ */

  function selectAnswer(score) {
    if (state.isTransitioning) return; // 遷移待機中の連打を無視する

    state.answers[state.currentIndex] = score;
    state.isTransitioning = true;
    renderQuestion(); // 選択状態を表示しつつ、操作をロックする

    // 選択が視覚的に伝わるよう一瞬待ってから自動で次の質問へ切り替える
    window.setTimeout(() => {
      state.isTransitioning = false;
      goNext();
    }, AUTO_ADVANCE_DELAY);
  }

  function goNext() {
    const isLast = state.currentIndex === state.questions.length - 1;
    if (isLast) {
      renderResultFromAnswers();
      return;
    }
    state.currentIndex += 1;
    renderQuestion();
  }

  function goBack() {
    if (state.currentIndex === 0 || state.isTransitioning) return;
    state.currentIndex -= 1;
    renderQuestion();
  }

  function startQuiz() {
    state.currentIndex = 0;
    state.answers = new Array(state.questions.length).fill(null);
    showScreen('quiz');
    renderQuestion();
  }

  function retryQuiz() {
    // URLに結果パラメータが残っていればクリアしておく
    if (window.history && window.history.replaceState) {
      window.history.replaceState(null, '', window.location.pathname);
    }
    showScreen('start');
  }

  els.btnStart.addEventListener('click', startQuiz);
  els.btnBack.addEventListener('click', goBack);
  els.btnRetry.addEventListener('click', retryQuiz);

  /* ------------------------------------------------------------------
   * 9. URL共有 / 初期化
   *    - 診断結果は ?type=XXXX のクエリパラメータで直接共有できる。
   *    - 「結果URLをコピー」「Xでシェア」ボタンから利用する。
   * ------------------------------------------------------------------ */

  function buildResultUrl(code) {
    const url = new URL(window.location.href);
    url.search = '';
    url.searchParams.set('type', code);
    return url.toString();
  }

  function updateShareLinks(code, typeName) {
    const resultUrl = buildResultUrl(code);

    els.btnCopyUrl.onclick = () => {
      navigator.clipboard.writeText(resultUrl)
        .then(() => { els.shareNote.textContent = t.copySuccess; })
        .catch(() => { els.shareNote.textContent = t.copyFailure; });
    };

    const shareText = encodeURIComponent(t.shareXText(typeName));
    const shareUrlEncoded = encodeURIComponent(resultUrl);
    els.btnShareX.href = `https://twitter.com/intent/tweet?text=${shareText}&url=${shareUrlEncoded}`;

    // URLを結果表示に合わせて更新しておく（ページ遷移は発生しない）
    if (window.history && window.history.replaceState) {
      window.history.replaceState(null, '', resultUrl);
    }
  }

  // 初期化: URLに ?type=XXXX が含まれていれば、診断を経由せず直接結果を表示する
  function init() {
    const params = new URLSearchParams(window.location.search);
    const sharedCode = params.get('type');

    if (sharedCode && TYPE_DATA[sharedCode.toUpperCase()]) {
      const code = sharedCode.toUpperCase();
      // 共有リンクから開いた場合はスコア内訳が無いため、
      // タイプの性質に応じたシンプルな軸バー（フルスコア相当）を表示する。
      const pseudoScores = {};
      AXES.forEach((axis, i) => {
        pseudoScores[axis.id] = code[i] === axis.left.code ? 10 : -10;
      });
      const pseudoMax = {};
      AXES.forEach((axis) => { pseudoMax[axis.id] = 10; });

      renderResultByCode(code);
      renderAxisBars(pseudoScores, pseudoMax);
    } else {
      showScreen('start');
    }
  }

  init();
})();
