/**
 * やました小児科医院 予約システム - 管理画面
 */

const Admin = (() => {
  let currentDate = null;
  let weekStart = null;
  let addMenuType = 'general'; // 'general' or 'custom'
  let addSelectedTime = null;

  // ============================================================
  // 認証
  // ============================================================

  function checkAuth() {
    if (sessionStorage.getItem('ym_admin_auth') === 'true') {
      showApp();
    }
  }

  function login(e) {
    e.preventDefault();
    const pw = document.getElementById('login-password').value;
    const config = getConfig();
    if (pw === config.adminPassword) {
      sessionStorage.setItem('ym_admin_auth', 'true');
      showApp();
    } else {
      document.getElementById('login-error').style.display = 'block';
    }
  }

  function showApp() {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('admin-app').style.display = 'block';
    currentDate = formatDate(new Date());
    weekStart = getMonday(new Date());
    renderDailyView();
    loadSettings();
  }

  // ============================================================
  // タブ切り替え
  // ============================================================

  function switchTab(tab) {
    document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`.admin-tab[data-tab="${tab}"]`).classList.add('active');

    document.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');
    document.getElementById(`tab-${tab}`).style.display = 'block';

    if (tab === 'daily') renderDailyView();
    if (tab === 'weekly') renderWeeklyView();
  }

  // ============================================================
  // 日別一覧
  // ============================================================

  function renderDailyView() {
    document.getElementById('admin-date-label').textContent = formatDateJP(currentDate);

    const all = getReservationsByDate(currentDate);
    const allIncCancelled = getReservations().filter(r => r.date === currentDate);

    // サマリーカード
    const summaryEl = document.getElementById('daily-summary');
    const generalCount = all.filter(r => r.menu === 'general').length;
    const customCount = all.filter(r => r.menu === 'custom').length;

    let summaryHTML = `
      <div class="summary-card" style="border-top-color:var(--color-orange)">
        <div class="count">${all.length}</div>
        <div class="label">合計</div>
      </div>
      <div class="summary-card" style="border-top-color:#f0c0a0">
        <div class="count">${generalCount}</div>
        <div class="label">診察予約</div>
      </div>`;
    if (customCount > 0) {
      summaryHTML += `
        <div class="summary-card" style="border-top-color:#b0d0f0">
          <div class="count">${customCount}</div>
          <div class="label">別枠メニュー</div>
        </div>`;
    }
    summaryEl.innerHTML = summaryHTML;

    // 予約リスト
    const listEl = document.getElementById('daily-list');
    if (allIncCancelled.length === 0) {
      listEl.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">&#x1f4cb;</div>
          <div class="empty-state-text">この日の予約はありません</div>
        </div>`;
      return;
    }

    // 時間順ソート
    const sorted = [...allIncCancelled].sort((a, b) => a.time.localeCompare(b.time));
    let html = '';
    sorted.forEach(r => {
      const cancelled = r.status === 'cancelled';
      const menuClass = r.menu === 'custom' ? 'custom' : 'general';
      const menuLabel = r.menuLabel || '診察予約';
      const sourceTag = r.source === 'admin' ? '<span style="font-size:0.7rem;color:var(--color-sub);margin-left:4px">（管理者）</span>' : '';
      html += `
        <div class="reservation-row${cancelled ? ' cancelled' : ''}" onclick="Admin.showDetail('${r.id}')">
          <div class="reservation-time">${r.time}</div>
          <span class="menu-badge ${menuClass}">${escapeHTML(menuLabel)}</span>
          <div class="reservation-info">
            <div class="reservation-patient">${escapeHTML(r.patient.furigana)}${sourceTag}</div>
            ${r.patient.childName ? `<div class="reservation-child">${escapeHTML(r.patient.childName)}</div>` : ''}
          </div>
          <span class="status-badge ${r.status}">${r.status === 'confirmed' ? '確認済' : 'キャンセル'}</span>
        </div>`;
    });
    listEl.innerHTML = html;
  }

  function prevDay() {
    const d = parseDate(currentDate);
    d.setDate(d.getDate() - 1);
    currentDate = formatDate(d);
    renderDailyView();
  }

  function nextDay() {
    const d = parseDate(currentDate);
    d.setDate(d.getDate() + 1);
    currentDate = formatDate(d);
    renderDailyView();
  }

  function jumpToDate(dateStr) {
    currentDate = dateStr;
    switchTab('daily');
  }

  // ============================================================
  // 週間一覧
  // ============================================================

  function getMonday(d) {
    const date = new Date(d);
    const day = date.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    date.setDate(date.getDate() + diff);
    return date;
  }

  function renderWeeklyView() {
    const endDate = new Date(weekStart);
    endDate.setDate(endDate.getDate() + 6);
    const startStr = formatDate(weekStart);
    const endStr = formatDate(endDate);

    document.getElementById('admin-week-label').textContent =
      `${startStr.substring(5).replace('-', '/')} 〜 ${endStr.substring(5).replace('-', '/')}`;

    const reservations = getReservationsByDateRange(startStr, endStr);
    const grid = document.getElementById('weekly-grid');
    let html = '';

    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      const dateStr = formatDate(d);
      const dow = d.getDay();
      const dows = ['日', '月', '火', '水', '木', '金', '土'];
      const open = isClinicOpen(dateStr);
      const dayRes = reservations.filter(r => r.date === dateStr && r.status !== 'cancelled');

      html += `<div class="weekly-day${open ? '' : ' closed'}" ${open ? `onclick="Admin.jumpToDate('${dateStr}')"` : ''}>
        <div class="weekly-day-date">${dows[dow]}</div>
        <div class="weekly-day-num">${d.getDate()}</div>`;

      if (open) {
        html += `<div class="weekly-day-count">${dayRes.length}件</div>`;
        const genCnt = dayRes.filter(r => r.menu === 'general').length;
        const custCnt = dayRes.filter(r => r.menu === 'custom').length;
        html += '<div class="weekly-day-bars">';
        html += `<div class="weekly-bar" style="background:${genCnt > 0 ? '#f0c0a0' : '#eee'}"></div>`;
        if (custCnt > 0) {
          html += `<div class="weekly-bar" style="background:#b0d0f0"></div>`;
        }
        html += '</div>';
      } else {
        html += '<div class="weekly-day-count" style="color:var(--color-closed)">休診</div>';
      }

      html += '</div>';
    }
    grid.innerHTML = html;
  }

  function prevWeek() {
    weekStart.setDate(weekStart.getDate() - 7);
    renderWeeklyView();
  }

  function nextWeek() {
    weekStart.setDate(weekStart.getDate() + 7);
    renderWeeklyView();
  }

  // ============================================================
  // 予約詳細モーダル
  // ============================================================

  function showDetail(id) {
    const r = getReservationById(id);
    if (!r) return;

    const menuClass = r.menu === 'custom' ? 'custom' : 'general';
    const menuLabel = r.menuLabel || '診察予約';

    const content = document.getElementById('detail-content');
    let detailHTML = `
      <div class="confirm-card" style="box-shadow:none;border:none;padding:0">
        <div class="confirm-row">
          <div class="confirm-label">予約番号</div>
          <div class="confirm-value" style="font-weight:700;color:var(--color-orange)">${r.id}</div>
        </div>
        <div class="confirm-row">
          <div class="confirm-label">ステータス</div>
          <div class="confirm-value"><span class="status-badge ${r.status}">${r.status === 'confirmed' ? '確認済み' : 'キャンセル'}</span></div>
        </div>
        <div class="confirm-row">
          <div class="confirm-label">予約日時</div>
          <div class="confirm-value">${formatDateJP(r.date)} ${r.time}〜</div>
        </div>
        <div class="confirm-row">
          <div class="confirm-label">メニュー</div>
          <div class="confirm-value"><span class="menu-badge ${menuClass}">${escapeHTML(menuLabel)}</span></div>
        </div>
        <div class="confirm-row">
          <div class="confirm-label">登録元</div>
          <div class="confirm-value">${r.source === 'admin' ? '管理者' : '患者'}</div>
        </div>`;

    if (r.patient.childName) {
      detailHTML += `
        <div class="confirm-row">
          <div class="confirm-label">お子さまの名前</div>
          <div class="confirm-value">${escapeHTML(r.patient.childName)}</div>
        </div>`;
    }

    detailHTML += `
        <div class="confirm-row">
          <div class="confirm-label">ふりがな</div>
          <div class="confirm-value">${escapeHTML(r.patient.furigana)}</div>
        </div>
        <div class="confirm-row">
          <div class="confirm-label">生年月日</div>
          <div class="confirm-value">${r.patient.birthDate || '未入力'}</div>
        </div>
        <div class="confirm-row">
          <div class="confirm-label">電話番号</div>
          <div class="confirm-value">${escapeHTML(r.patient.phone)}</div>
        </div>
        <div class="confirm-row">
          <div class="confirm-label">メール</div>
          <div class="confirm-value">${escapeHTML(r.patient.email)}</div>
        </div>`;

    if (r.patient.cardNumber) {
      detailHTML += `
        <div class="confirm-row">
          <div class="confirm-label">診察券番号</div>
          <div class="confirm-value">${escapeHTML(r.patient.cardNumber)}</div>
        </div>`;
    }

    detailHTML += `
        <div class="confirm-row">
          <div class="confirm-label">発熱</div>
          <div class="confirm-value" style="color:${r.patient.hasFever === 'yes' ? 'var(--color-danger)' : 'var(--color-green)'};font-weight:700">
            ${r.patient.hasFever === 'yes' ? 'あり' : 'なし'}
          </div>
        </div>`;

    if (r.patient.notes) {
      detailHTML += `
        <div class="confirm-row">
          <div class="confirm-label">症状・備考</div>
          <div class="confirm-value">${escapeHTML(r.patient.notes)}</div>
        </div>`;
    }

    detailHTML += `
        <div class="confirm-row">
          <div class="confirm-label">登録日時</div>
          <div class="confirm-value">${new Date(r.createdAt).toLocaleString('ja-JP')}</div>
        </div>
      </div>`;

    content.innerHTML = detailHTML;

    const actions = document.getElementById('detail-actions');
    if (r.status === 'confirmed') {
      actions.innerHTML = `
        <button class="btn btn-secondary" onclick="Admin.closeDetail()">閉じる</button>
        <button class="btn btn-danger" onclick="Admin.cancelReservation('${r.id}')">キャンセルにする</button>`;
    } else {
      actions.innerHTML = `
        <button class="btn btn-secondary" onclick="Admin.closeDetail()">閉じる</button>
        <button class="btn btn-primary" onclick="Admin.restoreReservation('${r.id}')">確認済みに戻す</button>`;
    }

    document.getElementById('detail-modal').style.display = 'flex';
  }

  function closeDetail() {
    document.getElementById('detail-modal').style.display = 'none';
  }

  function cancelReservation(id) {
    if (!confirm('この予約をキャンセルしますか？')) return;
    updateReservationStatus(id, 'cancelled');
    closeDetail();
    renderDailyView();
  }

  function restoreReservation(id) {
    updateReservationStatus(id, 'confirmed');
    closeDetail();
    renderDailyView();
  }

  // ============================================================
  // 予約追加モーダル
  // ============================================================

  function openAddModal() {
    addMenuType = 'general';
    addSelectedTime = null;

    // フォームリセット
    const form = document.getElementById('admin-add-form');
    form.reset();
    form.querySelectorAll('.form-error').forEach(e => e.classList.remove('show'));
    form.querySelectorAll('.form-input, .form-textarea').forEach(e => e.classList.remove('error'));

    // 日付を現在表示中の日付にセット
    document.getElementById('add-date').value = currentDate;

    // メニュートグルリセット
    document.querySelectorAll('.menu-type-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('.menu-type-btn[data-type="general"]').classList.add('active');
    document.getElementById('add-custom-menu-wrap').style.display = 'none';
    document.getElementById('add-custom-menu').value = '';

    // 時間枠をロード
    loadTimeSlotsForDate(currentDate);

    document.getElementById('add-modal').style.display = 'flex';
  }

  function closeAddModal() {
    document.getElementById('add-modal').style.display = 'none';
  }

  function loadTimeSlotsForDate(dateStr) {
    const container = document.getElementById('add-time-slots');
    addSelectedTime = null;

    const schedule = getScheduleForDate(dateStr);
    if (!schedule) {
      container.innerHTML = '<div style="color:var(--color-sub);font-size:0.85rem;padding:8px 0">この日は休診日です</div>';
      return;
    }

    const config = getConfig();
    const max = config.maxPerSlot || 5;
    let html = '';

    for (const block of schedule) {
      html += `<div style="grid-column:1/-1;font-size:0.8rem;font-weight:600;color:var(--color-sub);margin-top:4px">${block.label}（${block.start}〜${block.end}）</div>`;
      const slots = getTimeSlotsForBlock(block);
      for (const time of slots) {
        const count = getSlotCount(dateStr, time);
        const remaining = max - count;
        const full = remaining <= 0;
        if (full) {
          html += `<button type="button" class="slot-btn full" disabled>${time}<span class="slot-remaining">満</span></button>`;
        } else {
          html += `<button type="button" class="slot-btn" data-time="${time}" onclick="Admin.selectAddTime(this)">${time}<span class="slot-remaining" style="color:var(--color-green)">残${remaining}</span></button>`;
        }
      }
    }
    container.innerHTML = html;
  }

  function selectAddTime(el) {
    document.querySelectorAll('#add-time-slots .slot-btn').forEach(b => b.classList.remove('selected'));
    el.classList.add('selected');
    addSelectedTime = el.dataset.time;
  }

  function setMenuType(type) {
    addMenuType = type;
    document.querySelectorAll('.menu-type-btn').forEach(b => b.classList.remove('active'));
    document.querySelector(`.menu-type-btn[data-type="${type}"]`).classList.add('active');
    document.getElementById('add-custom-menu-wrap').style.display = type === 'custom' ? 'block' : 'none';
  }

  function validateAddForm() {
    let valid = true;

    // 日付
    const dateVal = document.getElementById('add-date').value;
    const dateErr = document.getElementById('add-err-date');
    if (!dateVal) {
      dateErr.classList.add('show');
      valid = false;
    } else {
      dateErr.classList.remove('show');
    }

    // 時間
    const timeErr = document.getElementById('add-err-time');
    if (!addSelectedTime) {
      timeErr.classList.add('show');
      valid = false;
    } else {
      timeErr.classList.remove('show');
    }

    // カスタムメニュー名
    const menuErr = document.getElementById('add-err-menu');
    if (addMenuType === 'custom' && !document.getElementById('add-custom-menu').value.trim()) {
      menuErr.classList.add('show');
      valid = false;
    } else {
      menuErr.classList.remove('show');
    }

    // 必須フィールド
    const checks = [
      { id: 'add-furigana', err: 'add-err-furigana' },
      { id: 'add-birthdate', err: 'add-err-birthdate' },
      { id: 'add-phone', err: 'add-err-phone' },
      { id: 'add-email', err: 'add-err-email' }
    ];

    checks.forEach(c => {
      const input = document.getElementById(c.id);
      const err = document.getElementById(c.err);
      if (!input.value.trim()) {
        input.classList.add('error');
        err.classList.add('show');
        valid = false;
      } else {
        input.classList.remove('error');
        err.classList.remove('show');
      }
    });

    // 発熱チェック
    const feverErr = document.getElementById('add-err-fever');
    if (!document.querySelector('input[name="add-fever"]:checked')) {
      feverErr.classList.add('show');
      valid = false;
    } else {
      feverErr.classList.remove('show');
    }

    return valid;
  }

  function submitAddForm(e) {
    e.preventDefault();
    if (!validateAddForm()) return;

    const dateVal = document.getElementById('add-date').value;
    const customMenu = document.getElementById('add-custom-menu').value.trim();

    const reservation = addReservation({
      date: dateVal,
      time: addSelectedTime,
      menu: addMenuType === 'custom' ? 'custom' : 'general',
      menuLabel: addMenuType === 'custom' ? customMenu : '診察予約',
      source: 'admin',
      patient: {
        childName: document.getElementById('add-child-name').value.trim(),
        furigana: document.getElementById('add-furigana').value.trim(),
        birthDate: document.getElementById('add-birthdate').value,
        phone: document.getElementById('add-phone').value.trim(),
        email: document.getElementById('add-email').value.trim(),
        cardNumber: document.getElementById('add-card-number').value.trim(),
        hasFever: document.querySelector('input[name="add-fever"]:checked')?.value || '',
        notes: document.getElementById('add-notes').value.trim()
      }
    });

    closeAddModal();

    // 登録した日付に移動して表示
    currentDate = dateVal;
    renderDailyView();

    alert(`予約を登録しました\n予約番号: ${reservation.id}`);
  }

  // ============================================================
  // CSVエクスポート
  // ============================================================

  function exportDaily() {
    const reservations = getReservations().filter(r => r.date === currentDate);
    if (reservations.length === 0) {
      alert('この日の予約データはありません');
      return;
    }
    const csv = exportToCSV(reservations);
    downloadCSV(csv, `予約一覧_${currentDate}.csv`);
  }

  // ============================================================
  // 設定
  // ============================================================

  function loadSettings() {
    const config = getConfig();
    document.getElementById('cfg-max-per-slot').value = config.maxPerSlot || 5;

    // サイトURL・EmailJS設定
    document.getElementById('cfg-site-url').value = config.siteUrl || '';
    if (config.emailjs) {
      document.getElementById('cfg-emailjs-service').value = config.emailjs.serviceId || '';
      document.getElementById('cfg-emailjs-template').value = config.emailjs.templateId || '';
      document.getElementById('cfg-emailjs-key').value = config.emailjs.publicKey || '';
    }

    // EmailJSステータス
    renderEmailStatus();

    // 休業日一覧
    renderClosedDays();
  }

  function renderClosedDays() {
    const days = getClosedDays();
    const container = document.getElementById('closed-days-list');
    if (days.length === 0) {
      container.innerHTML = '<div style="font-size:0.82rem;color:var(--color-sub);padding:8px 0">臨時休業日は設定されていません</div>';
      return;
    }

    // 過去の日付はグレーアウト、未来の日付のみ削除可能
    const today = formatDate(new Date());
    let html = '<div style="display:flex;flex-wrap:wrap;gap:8px">';
    days.forEach(d => {
      const isPast = d < today;
      html += `<div style="display:inline-flex;align-items:center;gap:6px;padding:6px 12px;background:${isPast ? '#f5f2f0' : 'var(--color-pink-light)'};border-radius:var(--radius-sm);font-size:0.82rem;${isPast ? 'opacity:0.5;' : ''}">
        <span>${formatDateJP(d)}</span>
        <button onclick="Admin.removeClosedDay('${d}')" style="background:none;border:none;cursor:pointer;font-size:1rem;color:var(--color-danger);padding:0 2px;line-height:1" title="削除">&times;</button>
      </div>`;
    });
    html += '</div>';
    container.innerHTML = html;
  }

  function addClosedDayAction() {
    const input = document.getElementById('cfg-closed-date');
    const dateStr = input.value;
    if (!dateStr) {
      alert('日付を選択してください');
      return;
    }

    // 既に定休日（木・日）や祝日の場合はスキップ
    const date = parseDate(dateStr);
    const dow = date.getDay();
    if (dow === 0 || dow === 4) {
      alert('この日は既に定休日（木曜・日曜）です');
      return;
    }
    if (isHoliday(dateStr)) {
      alert('この日は既に祝日で休診です');
      return;
    }
    if (isManualClosedDay(dateStr)) {
      alert('この日は既に休業日に設定されています');
      return;
    }

    addClosedDay(dateStr);
    input.value = '';
    renderClosedDays();
    // 日別一覧も更新
    renderDailyView();
  }

  function removeClosedDayAction(dateStr) {
    removeClosedDay(dateStr);
    renderClosedDays();
    renderDailyView();
  }

  function saveSlotConfig() {
    const config = getConfig();
    config.maxPerSlot = parseInt(document.getElementById('cfg-max-per-slot').value) || 5;
    saveConfig(config);
    alert('枠数設定を保存しました');
  }

  function saveEmailConfig() {
    const config = getConfig();
    config.siteUrl = document.getElementById('cfg-site-url').value.trim();
    config.emailjs = {
      serviceId: document.getElementById('cfg-emailjs-service').value.trim(),
      templateId: document.getElementById('cfg-emailjs-template').value.trim(),
      publicKey: document.getElementById('cfg-emailjs-key').value.trim(),
      cancelTemplateId: config.emailjs?.cancelTemplateId || ''
    };
    saveConfig(config);
    renderEmailStatus();
    alert('メール設定を保存しました');
  }

  function renderEmailStatus() {
    const bar = document.getElementById('email-status-bar');
    const config = getConfig();
    const emailConfigured = config.emailjs &&
      config.emailjs.serviceId &&
      config.emailjs.templateId &&
      config.emailjs.publicKey;
    const urlConfigured = !!config.siteUrl;

    let html = '';
    if (emailConfigured && urlConfigured) {
      html = '<div style="padding:10px 14px;background:var(--color-green-light);border:1px solid var(--color-green);border-radius:var(--radius-sm);font-size:0.85rem;font-weight:700;color:#5a8a5a">&#x2705; メール通知: 有効（設定済み）</div>';
    } else {
      const missing = [];
      if (!urlConfigured) missing.push('予約ページの公開URL');
      if (!emailConfigured) missing.push('EmailJS（Service ID / Template ID / Public Key）');
      html = '<div style="padding:10px 14px;background:#fef0f0;border:1px solid var(--color-danger);border-radius:var(--radius-sm);font-size:0.85rem;font-weight:700;color:var(--color-danger)">&#x26A0; メール通知: 無効<br><span style="font-weight:400;font-size:0.78rem">未設定: ' + missing.join('、') + '</span></div>';
    }
    bar.innerHTML = html;
  }

  function testEmail() {
    const serviceId = document.getElementById('cfg-emailjs-service').value.trim();
    const templateId = document.getElementById('cfg-emailjs-template').value.trim();
    const publicKey = document.getElementById('cfg-emailjs-key').value.trim();

    if (!serviceId || !templateId || !publicKey) {
      alert('Service ID、Template ID、Public Key を全て入力してから送信してください');
      return;
    }

    const testAddr = prompt('テストメールの送信先アドレスを入力してください:');
    if (!testAddr || !testAddr.includes('@')) return;

    // まず現在の入力値を保存
    saveEmailConfig();

    try {
      emailjs.init(publicKey);
    } catch (e) {
      alert('EmailJS の初期化に失敗しました。Public Key を確認してください。');
      return;
    }

    // 公開URLを使ってキャンセルリンク生成（ハッシュ形式）
    const config = getConfig();
    let cancelBase = config.siteUrl || window.location.href.split(/[?#]/)[0].replace('admin.html', 'index.html');
    cancelBase = cancelBase.split(/[?#]/)[0];

    const params = {
      to_email: testAddr,
      reservation_id: 'TEST-00000',
      reservation_date: formatDateJP(formatDate(new Date())),
      reservation_time: '09:00',
      child_name: 'テスト 太郎',
      furigana: 'てすと たろう',
      has_fever: 'なし',
      notes: 'これはテスト送信です',
      cancel_url: cancelBase + '#cancel=TEST-00000',
      clinic_name: 'やました小児科医院',
      clinic_phone: '0774-73-6873',
      clinic_phone_tel: 'tel:0774736873'
    };

    emailjs.send(serviceId, templateId, params)
      .then(() => {
        alert('テストメールを送信しました！\n' + testAddr + ' の受信箱を確認してください。\n\n届かない場合は迷惑メールフォルダも確認してください。');
      })
      .catch(err => {
        alert('メール送信に失敗しました。\n\nエラー: ' + (err.text || err.message || JSON.stringify(err)) + '\n\nService ID、Template ID、Public Key を再確認してください。');
        console.error('EmailJS test error:', err);
      });
  }

  function changePassword() {
    const config = getConfig();
    const oldPw = document.getElementById('cfg-old-pw').value;
    const newPw = document.getElementById('cfg-new-pw').value;

    if (oldPw !== config.adminPassword) {
      alert('現在のパスワードが正しくありません');
      return;
    }
    if (!newPw || newPw.length < 4) {
      alert('新しいパスワードは4文字以上で入力してください');
      return;
    }

    config.adminPassword = newPw;
    saveConfig(config);
    document.getElementById('cfg-old-pw').value = '';
    document.getElementById('cfg-new-pw').value = '';
    alert('パスワードを変更しました');
  }

  function clearAllData() {
    if (!confirm('全ての予約データを削除します。この操作は取り消せません。\n\n本当に削除しますか？')) return;
    if (!confirm('本当に全データを削除しますか？（最終確認）')) return;
    localStorage.removeItem(STORAGE_KEY);
    renderDailyView();
    alert('全データを削除しました');
  }

  // ============================================================
  // 初期化
  // ============================================================

  document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    document.getElementById('login-form').addEventListener('submit', login);
    document.getElementById('admin-add-form').addEventListener('submit', submitAddForm);

    // 日付変更時に時間枠を更新
    document.getElementById('add-date').addEventListener('change', (e) => {
      loadTimeSlotsForDate(e.target.value);
    });

    // モーダル外クリックで閉じる
    document.getElementById('detail-modal').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) closeDetail();
    });
    document.getElementById('add-modal').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) closeAddModal();
    });
  });

  return {
    switchTab, prevDay, nextDay, prevWeek, nextWeek,
    jumpToDate, showDetail, closeDetail,
    cancelReservation, restoreReservation,
    exportDaily, saveSlotConfig, saveEmailConfig, changePassword, clearAllData,
    openAddModal, closeAddModal, selectAddTime, setMenuType,
    addClosedDay: addClosedDayAction,
    removeClosedDay: removeClosedDayAction,
    testEmail
  };
})();
