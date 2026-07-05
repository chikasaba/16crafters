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
   *    human:イメージする人物像を書く（マスクデータ）
   *    拡張ポイント: 各タイプに image プロパティ (画像URL) を追加すれば
   *    render 側が自動的に画像を表示する（下記 renderResult 参照）。
   * ------------------------------------------------------------------ */
  const TYPE_DATA = {
    NDCP: {
      name: '偉大なる航海者',
      human:'クリストファー・コロンブス',
      image: null,
      description: '新天地を求め、仲間と共に壮大なスケールで新しい世界を切り拓く。計画作りと仲間集めに時間を惜しまない。',
      traits: [
        '遠征前には装備をしっかり準備する',
        '新天地の発見に大きな喜びを感じる',
        '仲間と役割分担しながら遠征を成功させる',
      ],
    },
    NDCI: {
      name: '放浪の天才画家',
      human:'山下清',
      image: null,
      description: '旅の途中で出会うと風景と人々に惹かれ、その場のアイデアを形にする自由人。一度見た景色は忘れない。',
      traits: [
        '気に入った景色があると建築したくなる',
        '旅先で思いついたことをすぐ形にする',
        '地図を埋めること自体が楽しい',
      ],
    },
    NDSP: {
      name: '越境する開拓者',
      human:'星街すいせい',
      image: null,
      description: '境界を越え、誰も踏み入れたことのない領域に美しい世界を築く。構想を練り、理想を実現するために単独行動を好む。',
      traits: [
        '人の少ない土地を好んで探す',
        '完成図を描いてから開拓を始める',
        '一人で自分の世界観を追求する',
      ],
    },
    NDSI: {
      name: '孤独な放浪画家',
      human:'ポール・ゴーギャン',
      image: null,
      description: '文明を離れ、魂が求める場所でただひたすらに美を追い求める孤高の芸術家。ただ自分の感性だけを頼りに世界を巡る。',
      traits: [
        '拠点を持たず旅を続けても苦にならない',
        '景色との一期一会を大切にする',
        '思いついた場所で自然に建築を始める',
      ],
    },
    NECP: {
      name: '開拓地の指導者',
      human:'ジョン・スミス',
      image: null,
      description: '新しい土地を効率的に開拓し、仲間と共に秩序ある美しい共同体を築く統率者。拠点網を各地に築いていく。',
      traits: [
        '遠征先にも機能的な拠点を整備する',
        '仲間の役割分担を考えるのが得意',
        '限られた資源を効率よく活用する',
      ],
    },
    NECI: {
      name: '統率の技術者',
      human:'トーマス・エジソン',
      image: null,
      description: '前へ進みながら、その場で最適な判断を下していく実践派。チームと息を合わせ、臨機応変に行動する。',
      traits: [
        '現場で最適解を見つけるのが得意る',
        '状況に応じて柔軟に方針を変えられる',
        '仲間との連携を自然に取れる',
      ],
    },
    NESP: {
      name: '不屈の合理主義者',
      human:'沖田十三',
      image: null,
      description: '決して諦めない精神の持ち主。過酷な環境でも論理的思考と不屈の精神で、自分の理想を追求し続けるサバイバー。',
      traits: [
        '生き残るためなら最適解を選ぶ',
        '装備や資源管理を徹底する',
        '一人でも長期遠征を続けられる',
      ],
    },
    NESI: {
      name: '荒野のサバイバー',
      human:'ベア・グリルス',
      image: null,
      description: '場所を選ばぬサバイバリスト。過酷な荒野を一人で生き抜き、その場の直感で驚異的な効率建築を生み出す。',
      traits: [
        '最低限の設備だけで十分楽しめる',
        'その場で使える方法をすぐ思いつく',
        '未知の土地ほど挑戦したくなる',
      ],
    },
    HDCP: {
      name: '理想郷の建設者',
      human:'アルベルト・シュペーア',
      image: null,
      description: '仲間と力を合わせ、一つの場所を徹底的に美しく育てる。後世にも残るような偉大な都市に憧れを抱く。',
      traits: [
        '街全体の景観を意識して設計する',
        '仲間と一つの町を育てることが好き',
        '長期間かけて理想郷を完成させる',
      ],
    },
    HDCI: {
      name: '天然のムードメーカー',
      human:'保登心愛',
      image: null,
      description: '仲間とワイワイしながら、その場のノリで町を彩る盛り上げ役。予定よりも今この瞬間の楽しさを大切にする。',
      traits: [
        '建築イベントや共同作業が好き',
        '思いつきで街を賑やかにする',
        '仲間との時間そのものを楽しめる',
      ],
    },
    HDSP: {
      name: '孤高の建築家',
      human:'アントニ・ガウディ',
      image: null,
      description: '自分だけの美学に基づき、じっくりと計画を練ってから理想の建物を作り上げる職人。妥協することなく、自らの作品に没頭する。',
      traits: [
        '細部まで妥協せず作り込む',
        '建築前に設計を練るのが好き',
        '一人で集中できる時間を大切にする',
      ],
    },
    HDSI: {
      name: '光と色彩の追跡者',
      human:'クロード・モネ',
      image: null,
      description: '自然の光と色彩を愛し、今この瞬間の美しさをキャンバスに写し取る自由人。感性の赴くままに美しい空間を作り上げる。',
      traits: [
        '光や自然を活かした建築を好む',
        'インスピレーションで建築を進める',
        '完成より制作過程を楽しめる',
      ],
    },
    HECP: {
      name: '堅実なる倉庫番',
      human:'ルートヴィヒ・エアハルト',
      image: null,
      description: '仲間と協力し、綿密な計画のもとで効率的な拠点運営を行う管理者タイプ。生産ラインや倉庫管理など、裏方の仕組みづくりに長ける。',
      traits: [
        '倉庫整理や資源管理が得意',
        '生産ラインを整えることに達成感を覚える',
        '仲間が使いやすい拠点づくりを考える',
      ],
    },
    HECI: {
      name: '頼れる現場主任',
      human:'松下幸之助',
      image: null,
      description: '拠点で起きる問題にその場で対応しながら、仲間と協力して効率的に作業を進める実務派。計画よりも臨機応変な判断力が武器。',
      traits: [
        'トラブル対応が得意',
        '必要に応じて設備を改善していく',
        '実用性を重視しながら仲間を支える',
      ],
    },
    HESP: {
      name: '離島の装置勢',
      human:'リーナス・トーバルズ',
      image: null,
      description: '一人でコツコツと、計画的にシステムを構築していく効率追求型の職人。自動化や動線設計にこだわり、無駄のない拠点を作り上げる。',
      traits: [
        '自動化装置を作るのが好き',
        '動線や効率を徹底的に考える',
        '一人で長時間作業しても苦にならない',
      ],
    },
    HESI: {
      name: '異端なる設計者',
      human:'リヒャルト・フォークト',
      image: null,
      description: '拠点にこもり、思いつきで”便利”な仕掛けや装置を作ってしまう。効率化の鬼でありながら、出来たものはどこか常軌を逸している。',
      traits: [
        '思いつきで奇抜な装置を作る',
        '常識にとらわれない発想を楽しむ',
        '「便利そうだから」という理由で実験を始める',
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
