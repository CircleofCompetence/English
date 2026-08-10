(() => {
  'use strict';
  const TOTAL = 10;
  const $ = id => document.getElementById(id);
  const screens = ['welcomeScreen','quizScreen','resultScreen'];
  let game = [], current = 0, score = 0, answered = false;
  let speechTimers = [], audioContext = null, bgmTimer = null, soundOn = false;
  let memoryBest = 0;

  // iOS 개인 정보 보호 모드나 file:// 실행에서는 localStorage 접근 자체가
  // 예외를 던질 수 있습니다. 기록 기능이 막혀도 게임은 계속되게 합니다.
  function getBestScore() {
    try { return Number(window.localStorage.getItem('hajunBest') || memoryBest || 0); }
    catch (_) { return memoryBest; }
  }
  function saveBestScore(value) {
    memoryBest = value;
    try { window.localStorage.setItem('hajunBest', String(value)); } catch (_) { /* 저장 없이 계속 */ }
  }

  const shuffle = list => {
    const copy = [...list];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };

  function showScreen(id) {
    screens.forEach(name => $(name).hidden = name !== id);
    try { window.scrollTo({top: 0, behavior: 'smooth'}); }
    catch (_) { window.scrollTo(0, 0); }
  }

  function startGame() {
    stopSpeech();
    game = shuffle(window.QUESTIONS).slice(0, TOTAL);
    current = 0; score = 0;
    showScreen('quizScreen');
    renderQuestion();
  }

  function makeChoices(answer) {
    const sameGroup = shuffle(window.QUESTIONS.filter(q => q.category === answer.category && q.word !== answer.word));
    let distractors = sameGroup.slice(0, 3);
    if (distractors.length < 3) {
      const extra = shuffle(window.QUESTIONS.filter(q => q.word !== answer.word && !distractors.includes(q)));
      distractors = distractors.concat(extra.slice(0, 3 - distractors.length));
    }
    return shuffle([answer, ...distractors]);
  }

  function renderQuestion() {
    answered = false;
    const q = game[current];
    $('questionCount').textContent = `${current + 1} / ${TOTAL}`;
    $('scoreLabel').textContent = `⭐ ${score}`;
    $('progressBar').style.width = `${((current + 1) / TOTAL) * 100}%`;
    $('questionTitle').textContent = q.word;
    $('listenStatus').textContent = '3번 들려줄게요';
    $('feedback').hidden = true;
    $('feedback').className = 'feedback';
    $('nextButton').hidden = true;
    const grid = $('answerGrid');
    grid.innerHTML = '';
    makeChoices(q).forEach(choice => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'answer-card';
      button.dataset.word = choice.word;
      button.setAttribute('aria-label', `${choice.ko} 그림`);
      button.innerHTML = `<span class="answer-emoji" aria-hidden="true">${choice.emoji}</span>`;
      button.addEventListener('click', () => chooseAnswer(button, choice));
      grid.appendChild(button);
    });
    setTimeout(() => speakThreeTimes(q.word), 350);
  }

  function chooseAnswer(button, choice) {
    if (answered) return;
    answered = true;
    stopSpeech();
    const answer = game[current];
    const correct = choice.word === answer.word;
    document.querySelectorAll('.answer-card').forEach(card => {
      card.disabled = true;
      if (card.dataset.word === answer.word) {
        if (!correct) card.classList.add('reveal');
        card.insertAdjacentHTML('beforeend', '<span class="choice-mark">✓</span>');
      }
    });
    button.classList.add(correct ? 'correct' : 'wrong');
    if (correct) {
      score++;
      $('scoreLabel').textContent = `⭐ ${score}`;
      $('feedbackIcon').textContent = '🎉';
      $('feedbackTitle').textContent = '딩동댕! 정말 잘했어!';
      $('feedbackText').textContent = `${answer.word}는 “${answer.ko}”라는 뜻이야.`;
      playCorrect();
    } else {
      $('feedback').classList.add('wrong-feedback');
      $('feedbackIcon').textContent = '💡';
      $('feedbackTitle').textContent = '괜찮아, 하나 배웠어!';
      $('feedbackText').textContent = `정답은 ${answer.emoji} ${answer.word}! “${answer.ko}”라는 뜻이야.`;
      playWrong();
    }
    $('feedback').hidden = false;
    $('nextButton').textContent = current === TOTAL - 1 ? '결과 보기  →' : '다음 문제  →';
    $('nextButton').hidden = false;
  }

  function nextQuestion() {
    if (!answered) return;
    current++;
    if (current < TOTAL) renderQuestion(); else showResult();
  }

  function showResult() {
    stopSpeech();
    const best = Math.max(score, getBestScore());
    saveBestScore(best);
    $('finalScore').textContent = `${score} / ${TOTAL}`;
    $('starRating').textContent = '⭐'.repeat(Math.max(1, Math.ceil(score / 2)));
    if (score === 10) {
      $('resultTitle').textContent = '하준이 완벽해!'; $('resultFace').textContent = '🏆';
      $('resultMessage').textContent = '10문제를 모두 맞혔어! 영어 탐험왕이야!';
    } else if (score >= 7) {
      $('resultTitle').textContent = '하준이 최고!'; $('resultFace').textContent = '🦁';
      $('resultMessage').textContent = '정말 잘했어! 조금만 더 하면 만점이야.';
    } else {
      $('resultTitle').textContent = '하준이 잘했어!'; $('resultFace').textContent = '🐣';
      $('resultMessage').textContent = '새 단어를 많이 만났네! 한 번 더 해볼까?';
    }
    updateBest(); showScreen('resultScreen'); playFinish();
  }

  function stopSpeech() {
    speechTimers.forEach(clearTimeout); speechTimers = [];
    try { if ('speechSynthesis' in window) window.speechSynthesis.cancel(); } catch (_) { /* 계속 */ }
  }

  function speak(word) {
    if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) {
      $('listenStatus').textContent = '이 기기에서는 발음 읽기를 지원하지 않아요'; return;
    }
    try {
      window.speechSynthesis.cancel();
      window.speechSynthesis.resume();
      const u = new SpeechSynthesisUtterance(word);
      u.lang = 'en-US'; u.rate = .72; u.pitch = 1.08; u.volume = soundOn ? 1 : 0;
      const voices = window.speechSynthesis.getVoices() || [];
      u.voice = voices.find(v => /^en/i.test(v.lang) && /female|samantha|zira|google us/i.test(v.name)) || voices.find(v => /^en/i.test(v.lang)) || null;
      window.speechSynthesis.speak(u);
    } catch (_) {
      $('listenStatus').textContent = '발음을 재생하지 못했어요. 그림 퀴즈는 계속할 수 있어요!';
    }
  }

  function speakThreeTimes(word) {
    stopSpeech();
    if (!soundOn) { $('listenStatus').textContent = '🔇 소리 버튼을 켜면 발음을 들어요'; return; }
    [0, 3000, 6000].forEach((delay, index) => {
      speechTimers.push(setTimeout(() => {
        $('listenStatus').textContent = `${index + 1}번째 발음 · ${index < 2 ? '3초 뒤 다시 들려줘요' : '이제 그림을 골라요!'}`;
        speak(word);
      }, delay));
    });
  }

  function ensureAudio() {
    try {
      const AudioClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioClass) return false;
      if (!audioContext) audioContext = new AudioClass();
      if (audioContext.state === 'suspended') {
        const resumed = audioContext.resume();
        if (resumed && typeof resumed.catch === 'function') resumed.catch(() => {});
      }
      return true;
    } catch (_) { return false; }
  }
  function tone(freq, when, duration, type='sine', volume=.08) {
    if (!soundOn) return;
    if (!ensureAudio() || !audioContext) return;
    try {
      const osc=audioContext.createOscillator(), gain=audioContext.createGain();
      osc.type=type; osc.frequency.value=freq; gain.gain.setValueAtTime(volume,when); gain.gain.exponentialRampToValueAtTime(.001,when+duration);
      osc.connect(gain).connect(audioContext.destination); osc.start(when); osc.stop(when+duration);
    } catch (_) { /* 효과음을 건너뛰고 계속 */ }
  }
  function playCorrect(){if(!ensureAudio()||!audioContext)return;[523,659,784,1047].forEach((n,i)=>tone(n,audioContext.currentTime+i*.12,.35,'sine',.11))}
  function playWrong(){if(!ensureAudio()||!audioContext)return;tone(330,audioContext.currentTime,.25,'triangle',.07);tone(262,audioContext.currentTime+.18,.4,'triangle',.06)}
  function playFinish(){if(!soundOn||!ensureAudio()||!audioContext)return;[523,659,784,1047,1319].forEach((n,i)=>tone(n,audioContext.currentTime+i*.14,.5,'sine',.09))}
  function startBgm(){
    if (!soundOn || bgmTimer || !ensureAudio() || !audioContext) return;
    const notes=[261.63,329.63,392,329.63,293.66,349.23,440,349.23]; let i=0;
    const play=()=>{if(soundOn){tone(notes[i++%notes.length],audioContext.currentTime,1.4,'sine',.018)}};
    play(); bgmTimer=setInterval(play,1450);
  }
  function stopBgm(){clearInterval(bgmTimer);bgmTimer=null}
  function toggleSound(force) {
    soundOn = typeof force === 'boolean' ? force : !soundOn;
    $('soundButton').textContent = soundOn ? '🔊' : '🔇';
    $('soundButton').setAttribute('aria-label', soundOn ? '소리 끄기' : '소리 켜기');
    $('soundButton').setAttribute('aria-pressed', String(soundOn));
    if(soundOn){ensureAudio();startBgm();if(!$('quizScreen').hidden && game[current])speakThreeTimes(game[current].word)}else{stopBgm();stopSpeech()}
  }
  function updateBest(){const best=getBestScore();$('bestScore').textContent=best?`나의 최고 기록: ${best} / 10 ⭐`:'나의 최고 기록: 아직 없어요'}
  function goHome(){stopSpeech();showScreen('welcomeScreen');updateBest()}

  $('startButton').addEventListener('click',()=>{toggleSound(true);startGame()});
  $('soundButton').addEventListener('click',()=>toggleSound());
  $('replayButton').addEventListener('click',()=>speakThreeTimes(game[current].word));
  $('nextButton').addEventListener('click',nextQuestion);
  $('restartButton').addEventListener('click',startGame);
  $('homeButton').addEventListener('click',goHome);
  $('resultHomeButton').addEventListener('click',goHome);
  updateBest();
})();
