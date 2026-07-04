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
    shuffleQuestions: false, // 拡張ポイント: true にすると出題順がランダムになる
  };

  const currentLang = 'ja'; // 拡張ポイント: 将来的にユーザー設定等から切り替え可能にする

  const UI_TEXT = {
    ja: {
      progressLabel: (current, total) => `Q${current} / ${total}`,
      nextButton: '次へ',
      lastButton: '結果を見る',
      copySuccess: 'URLをコピーしました！',
      copyFailure: 'コピーに失敗しました。手動でURLをコピーしてください。',
      shareXText: (typeName) => `マイクラ活動スタイル診断で「${typeName}」タイプでした！`,
    },
  };
  const t = UI_TEXT[currentLang];

  /* ------------------------------------------------------------------
   * 2. 軸データ定義
   *    id         : 内部識別子 (questions[].axis と対応させる)
   *    left/right : 各極の { code(1文字), label(表示名), desc(説明) }
   *    スコアが 0 以上なら left、負なら right 側の性質が強いと判定する。
   * ------------------------------------------------------------------ */
  const AXES = [
    {
      id: 'settlement',
      left: { code: 'X', label: '開拓', desc: '新しい土地や資源、冒険を求める' },
      right: { code: 'S', label: '定住', desc: '拠点や街を育てることを好む' },
    },
    {
      id: 'aesthetics',
      left: { code: 'A', label: '美観', desc: '景観・世界観・デザインを重視する' },
      right: { code: 'E', label: '効率', desc: '利便性・生産性・機能性を重視する' },
    },
    {
      id: 'social',
      left: { code: 'C', label: '協同', desc: '他プレイヤーとの共同作業を好む' },
      right: { code: 'I', label: '自律', desc: '自分のペースで独立して活動することを好む' },
    },
    {
      id: 'planning',
      left: { code: 'P', label: '計画', desc: '事前準備や設計を重視する' },
      right: { code: 'M', label: '即興', desc: '思いつきやその場の発想で行動する' },
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
    // --- 開拓(X) / 定住(S) ---
    { text: '新しいバイオームを見つけると、すぐに探検したくなる', axis: 'settlement', reverse: false },
    { text: '拠点にじっくり手を加え、少しずつ発展させるのが好きだ', axis: 'settlement', reverse: true },
    { text: '遠くの村や遺跡を見ると、行ってみたくなる', axis: 'settlement', reverse: false },
    { text: '同じ場所に長く留まるより、常に移動していたい', axis: 'settlement', reverse: false },
    { text: '拠点の周辺環境を整備し、住みやすくすることに喜びを感じる', axis: 'settlement', reverse: true },

    // --- 美観(A) / 効率(E) ---
    { text: '建築するときは、見た目の美しさを最優先する', axis: 'aesthetics', reverse: false },
    { text: '作業効率が上がるなら、見た目は二の次でよい', axis: 'aesthetics', reverse: true },
    { text: '街並みや景観にこだわり、統一感を大事にする', axis: 'aesthetics', reverse: false },
    { text: '動線や資材コストを重視して建物を設計する', axis: 'aesthetics', reverse: true },
    { text: '実用性より美しさを重視した建築物を作りたい', axis: 'aesthetics', reverse: false },

    // --- 協同(C) / 自律(I) ---
    { text: '誰かと一緒に建築や採掘をすると、より楽しく感じる', axis: 'social', reverse: false },
    { text: 'マルチプレイでも、自分のペースで一人で進めたい', axis: 'social', reverse: true },
    { text: 'チームで役割分担して、大きなプロジェクトを進めたい', axis: 'social', reverse: false },
    { text: '他人に手伝ってもらうより、自分でやり遂げたい', axis: 'social', reverse: true },
    { text: '仲間と成果を共有し、一緒に喜びたい', axis: 'social', reverse: false },

    // --- 計画(P) / 即興(M) ---
    { text: '建築や冒険の前には、必ず計画を立てる', axis: 'planning', reverse: false },
    { text: 'その場の思いつきで、行動を変えることが多い', axis: 'planning', reverse: true },
    { text: '設計図やメモを作ってから作業に取り掛かる', axis: 'planning', reverse: false },
    { text: '準備よりも、まず行動してから考えるタイプだ', axis: 'planning', reverse: true },
    { text: '目標やスケジュールを決めてから進めたい', axis: 'planning', reverse: false },
  ];

  /* 回答選択肢: 5段階評価とスコアの対応 */
  const ANSWER_OPTIONS = [
    { label: 'そう思う', score: 2 },
    { label: 'どちらかといえばそう思う', score: 1 },
    { label: 'どちらでもない', score: 0 },
    { label: 'どちらかといえばそう思わない', score: -1 },
    { label: 'そう思わない', score: -2 },
  ];

  /* ------------------------------------------------------------------
   * 4. タイプ(診断結果)データ定義
   *    key: AXES の順番で left/right のコードを連結した4文字 (例: "XACP")
   *    拡張ポイント: 各タイプに image プロパティ (画像URL) を追加すれば
   *    render 側が自動的に画像を表示する（下記 renderResult 参照）。
   * ------------------------------------------------------------------ */
  const TYPE_DATA = {
    XACP: {
      name: '絶景を求める探検隊長',
      image: null,
      description: '新天地を求めて突き進みながらも、行く先々の景色や街づくりにこだわりを持つ。仲間と共に大きな目標へ向かって、しっかり計画を練ってから冒険に出るタイプ。',
      traits: [
        '遠征前にルートや装備をしっかり準備する',
        '発見した土地に美しい拠点や道標を残す',
        '仲間と役割分担しながら大規模な遠征を成功させる',
      ],
    },
    XACM: {
      name: '気まぐれな冒険画家',
      image: null,
      description: '思い立ったらすぐ冒険に出る自由人。美しい景色に出会うたびに寄り道し、仲間を誘って即興のプロジェクトを楽しむ。計画よりもその場のひらめきを大切にする。',
      traits: [
        '綺麗な景色を見つけると、その場で建築を始める',
        '仲間を巻き込んで思いつきの冒険を企画する',
        '準備不足でも、なんとかなると笑って進む',
      ],
    },
    XAIP: {
      name: '孤高の景観設計士',
      image: null,
      description: '誰の手も借りず、自分だけの美意識で新天地を切り拓く。事前にしっかり構想を練り、理想の景観を実現するために単独行動を好む。',
      traits: [
        '一人でじっくり土地を選び、設計図を描いてから着手する',
        '景観を損なわないよう、細部までこだわり抜く',
        '干渉されない環境で自分の世界観を追求する',
      ],
    },
    XAIM: {
      name: '放浪の風景詩人',
      image: null,
      description: '気の向くままに旅をし、美しい景色に出会えばそこに留まって創作する自由な魂。計画も仲間も必要とせず、自分の感性だけを頼りに世界を巡る。',
      traits: [
        '決まった目的地を持たず、ふらりと旅立つ',
        '心惹かれた景色を、即興でアートに変える',
        '一人の時間の中で創造性を発揮する',
      ],
    },
    XECP: {
      name: '資源開発プロジェクトリーダー',
      image: null,
      description: '新しい土地の資源を効率よく活用するため、仲間と綿密な計画を立てて開拓を進める。実用性を重視した拠点網を各地に築いていく。',
      traits: [
        '資源マップや採掘計画を仲間と共有する',
        '効率的な輸送網や自動化施設を各地に展開する',
        'チームで役割を分担し、開拓のスピードを上げる',
      ],
    },
    XECM: {
      name: '即断即決の遠征隊',
      image: null,
      description: 'とにかく前へ進みながら、その場で最適な判断を下していく実践派。仲間と息を合わせ、効率を重視しつつも臨機応変に行動する。',
      traits: [
        '状況に応じて、その場で作戦を変更する',
        '仲間と即興で連携し、無駄なく資源を確保する',
        '立ち止まって考えるより、動きながら考える',
      ],
    },
    XEIP: {
      name: '効率重視のソロ探検家',
      image: null,
      description: '単独で新天地を切り拓きながら、常に効率的な動きを追求する。事前準備を怠らず、無駄のない行程で着実に成果を積み上げていく。',
      traits: [
        '一人で採算の取れるルートを綿密に計画する',
        '最短距離で資源や拠点を確保する',
        '誰にも頼らず、自己完結した開拓を進める',
      ],
    },
    XEIM: {
      name: '気ままなサバイバリスト',
      image: null,
      description: 'その日の思いつきで新しい土地に飛び込み、限られた資源で効率よく生き抜く一匹狼。計画は最小限に、経験と勘で乗り切っていく。',
      traits: [
        'とりあえず飛び出してから、対応策を考える',
        '少ない道具で最大の成果を出す工夫をする',
        '誰の指図も受けず、自分のスタイルを貫く',
      ],
    },
    SACP: {
      name: '街づくりの総合プロデューサー',
      image: null,
      description: '仲間と力を合わせ、美しく機能的な街を計画的に育てていくまとめ役。長期的なビジョンを持ち、皆が心地よく過ごせる拠点づくりに情熱を注ぐ。',
      traits: [
        '街全体のデザインコンセプトを仲間と共有する',
        '長期計画を立てて段階的に街を発展させる',
        'みんなの意見をまとめてプロジェクトを推進する',
      ],
    },
    SACM: {
      name: 'みんなで楽しむ装飾職人',
      image: null,
      description: '仲間とワイワイしながら、その場のノリで拠点を彩っていくムードメーカー。計画よりも今この瞬間の楽しさを大切にする。',
      traits: [
        '仲間とアイデアを出し合いながら装飾を進める',
        '思いつきの企画でイベントや建築を盛り上げる',
        '完璧さより、一緒に楽しむ過程を重視する',
      ],
    },
    SAIP: {
      name: '孤高の建築家',
      image: null,
      description: '自分だけの美学に基づき、じっくりと設計を練ってから理想の建物を作り上げる職人肌。誰にも邪魔されない環境で創作に没頭する。',
      traits: [
        '緻密な設計図を描いてから建築に取り掛かる',
        '妥協せず、美しさを追求し続ける',
        '一人の時間を大切にし、自分のペースを守る',
      ],
    },
    SAIM: {
      name: '気の向くままの庭師',
      image: null,
      description: '拠点の中で、その日の気分に任せて庭や花壇を手入れする自由な創作者。計画は立てず、感性の赴くままに美しい空間を作り上げる。',
      traits: [
        '決まった手順を持たず、思いつきで手を加える',
        '小さな空間を丁寧に、美しく仕上げる',
        '一人静かに創作の時間を楽しむ',
      ],
    },
    SECP: {
      name: '拠点運営マネージャー',
      image: null,
      description: '仲間と協力し、綿密な計画のもとで効率的な拠点運営を行う管理者タイプ。生産ラインや倉庫管理など、裏方の仕組みづくりに長ける。',
      traits: [
        '資材や生産の管理表を作って仲間と共有する',
        '自動化施設を計画的に整備する',
        'チームの生産性を最大化する仕組みを考える',
      ],
    },
    SECM: {
      name: '頼れる現場監督',
      image: null,
      description: '拠点で起きる問題にその場で対応しながら、仲間と協力して効率的に作業を進める実務派。計画よりも臨機応変な判断力が武器。',
      traits: [
        'トラブルが起きても、すぐに仲間と対処する',
        '効率的な作業分担を、その場で采配する',
        '状況に応じて柔軟に方針を変える',
      ],
    },
    SEIP: {
      name: '職人気質の生産マイスター',
      image: null,
      description: '一人でコツコツと、計画的に生産システムを構築していく効率追求型の職人。自動化や動線設計にこだわり、無駄のない拠点を作り上げる。',
      traits: [
        '一人で綿密な生産計画を立てて実行する',
        '効率的な自動化装置を作り込む',
        '誰にも頼らず、着実に成果を積み上げる',
      ],
    },
    SEIM: {
      name: '思いつき工房の発明家',
      image: null,
      description: '拠点にこもり、その場の思いつきで便利な仕掛けや装置を作る一人ぼっちの発明家。計画は立てず、試行錯誤しながら効率的な仕組みを生み出す。',
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
    btnNext: document.getElementById('btnNext'),
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

    // 戻る/次へボタンの状態
    els.btnBack.disabled = index === 0;
    els.btnNext.textContent = index === total - 1 ? t.lastButton : t.nextButton;
    els.btnNext.disabled = answered === null;
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
      const markerPercent = 50 + ratio * 50;
      const fillLeft = ratio >= 0 ? 50 : markerPercent;
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
    state.answers[state.currentIndex] = score;
    renderQuestion(); // 選択状態と次へボタンの有効/無効を更新
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
    if (state.currentIndex === 0) return;
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
  els.btnNext.addEventListener('click', goNext);
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
