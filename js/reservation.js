/**
 * やました小児科医院 予約システム - 予約ウィザード（当日予約専用）
 */

const Wizard = (() => {
  let currentStep = 1;
  let todayDate = null;
  let state = { time: null, patient: {} };

  const STEP_LABELS = {
    1: 'ご希望の時間を選択してください',
    2: 'ご予約情報を入力してください',
    3: '内容をご確認ください',
    4: 'ご予約が完了しました'
  };

  function init() {
    // キャンセルURLチェック（#cancel=ID 形式と ?cancel=ID 形式の両方に対応）
    const hash = window.location.hash;
    if (hash && hash.startsWith('#cancel=')) {
      showCancelScreen(hash.replace('#cancel=', ''));
      return;
    }
    const params = new URLSearchParams(window.location.search);
    if (params.has('cancel')) {
      showCancelScreen(params.get('cancel'));
      return;
    }

    // 当日予約可能チェック
    const check = isTodayBookable();
    if (!check.ok) {
      showClosedScreen(check.reason);
      return;
    }

    todayDate = check.date;
    document.getElementById('booking-flow').style.display = 'block';
    document.getElementById('today-date-bar').innerHTML =
      `&#x1f4c5; 本日 ${formatDateJP(todayDate)} の診察予約`;

    renderTimeSlots();
    document.getElementById('patient-form').addEventListener('submit', onFormSubmit);
  }

  // ---- 閉診/受付時間外 ----
  function showClosedScreen(reason) {
    document.getElementById('screen-closed').style.display = 'block';
    const title = document.getElementById('closed-title');
    const msg = document.getElementById('closed-message');

    if (reason === 'closed') {
      title.textContent = '本日は休診日です';
      msg.innerHTML = '申し訳ございませんが、本日は休診日のためWeb予約はご利用いただけません。<br><br>診療日にあらためてアクセスしてください。<br><br>お急ぎの場合はお電話ください。<br><span class="phone-link">TEL: 0774-73-6873</span>';
    } else if (reason === 'early') {
      title.textContent = '予約受付時間前です';
      msg.innerHTML = '本日のWeb予約受付は<strong>午前8:00</strong>から開始します。<br><br>8時以降にあらためてアクセスしてください。<br><br>お急ぎの場合はお電話ください。<br><span class="phone-link">TEL: 0774-73-6873</span>';
    }
  }

  // ---- キャンセル画面 ----
  function showCancelScreen(reservationId) {
    document.getElementById('screen-cancel').style.display = 'block';
    const content = document.getElementById('cancel-content');
    const reservation = getReservationById(reservationId);

    if (!reservation) {
      content.innerHTML = `
        <div class="cancel-icon">&#x2753;</div>
        <div class="cancel-title">予約が見つかりません</div>
        <div class="cancel-message">指定された予約番号が見つかりませんでした。<br>予約番号をご確認ください。</div>
        <a href="index.html" class="btn btn-secondary" style="display:inline-block;width:auto;margin-top:12px">トップに戻る</a>`;
      return;
    }

    const canCancel = canCancelReservation(reservation);

    if (reservation.status === 'cancelled') {
      content.innerHTML = `
        <div class="cancel-icon">&#x2139;</div>
        <div class="cancel-title">この予約はキャンセル済みです</div>
        <div class="cancel-message">予約番号: ${escapeHTML(reservation.id)}<br>${formatDateJP(reservation.date)} ${reservation.time}〜</div>
        <a href="index.html" class="btn btn-secondary" style="display:inline-block;width:auto;margin-top:12px">トップに戻る</a>`;
      return;
    }

    if (!canCancel.ok && canCancel.reason === 'too_late') {
      content.innerHTML = `
        <div class="cancel-icon">&#x23F0;</div>
        <div class="cancel-title">キャンセル期限を過ぎています</div>
        <div class="cancel-message">
          予約番号: ${escapeHTML(reservation.id)}<br>
          ${formatDateJP(reservation.date)} ${reservation.time}〜<br><br>
          キャンセルは予約時間の<strong>1時間前まで</strong>となっております。<br>
          直前のキャンセル・変更はお電話にてお願いいたします。
        </div>
        <div class="phone-link">TEL: 0774-73-6873</div>
        <br><a href="index.html" class="btn btn-secondary" style="display:inline-block;width:auto;margin-top:12px">トップに戻る</a>`;
      return;
    }

    // キャンセル可能
    content.innerHTML = `
      <div class="cancel-icon">&#x26A0;</div>
      <div class="cancel-title">予約をキャンセルしますか？</div>
      <div class="confirm-card" style="text-align:left;margin:16px 0">
        <div class="confirm-row"><div class="confirm-label">予約番号</div><div class="confirm-value">${escapeHTML(reservation.id)}</div></div>
        <div class="confirm-row"><div class="confirm-label">日時</div><div class="confirm-value">${formatDateJP(reservation.date)} ${reservation.time}〜</div></div>
        <div class="confirm-row"><div class="confirm-label">ふりがな</div><div class="confirm-value">${escapeHTML(reservation.patient.furigana)}</div></div>
      </div>
      <div class="notice-bar" style="text-align:left">
        ※ キャンセル後の取り消しはできません。<br>
        ※ 再度ご予約の場合は、予約ページから新規にお申し込みください。
      </div>
      <div class="btn-group">
        <a href="index.html" class="btn btn-secondary">戻る</a>
        <button class="btn btn-danger" onclick="Wizard.confirmCancel('${reservationId}')">キャンセルする</button>
      </div>`;
  }

  function confirmCancel(id) {
    const result = updateReservationStatus(id, 'cancelled');
    if (result) {
      const content = document.getElementById('cancel-content');
      content.innerHTML = `
        <div class="cancel-icon">&#x2705;</div>
        <div class="cancel-title">予約をキャンセルしました</div>
        <div class="cancel-message">
          予約番号: ${escapeHTML(result.id)}<br>
          ${formatDateJP(result.date)} ${result.time}〜<br><br>
          キャンセルが完了しました。
        </div>
        <a href="index.html" class="btn btn-primary" style="display:inline-block;width:auto;margin-top:12px">トップに戻る</a>`;
    }
  }

  // ---- ステップ制御 ----
  function goTo(step) {
    currentStep = step;
    document.querySelectorAll('.step').forEach(el => el.classList.remove('active', 'print-target'));
    document.getElementById(`step-${step}`).classList.add('active');
    if (step === 4) document.getElementById(`step-${step}`).classList.add('print-target');

    document.querySelectorAll('.step-dot').forEach(dot => {
      const s = parseInt(dot.dataset.step);
      dot.classList.remove('active', 'done');
      if (s < step) dot.classList.add('done');
      if (s === step) dot.classList.add('active');
    });

    document.getElementById('step-label').textContent = STEP_LABELS[step];
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ---- Step 1: 時間枠選択 ----
  function renderTimeSlots() {
    const container = document.getElementById('time-slots-container');
    const blocks = getAvailableSlots(todayDate);

    if (blocks.length === 0) {
      container.innerHTML = '<div class="empty-state"><div class="empty-state-text">本日の予約枠はありません</div></div>';
      return;
    }

    let html = '';
    for (const block of blocks) {
      html += `<div class="time-block">`;
      html += `<div class="time-block-header">${block.label}（${block.period}）</div>`;
      html += '<div class="slot-grid">';
      for (const slot of block.slots) {
        if (slot.available) {
          html += `<button class="slot-btn" data-time="${slot.time}">
            ${slot.time}
            <span class="slot-remaining" style="color:var(--color-green)">残${slot.remaining}</span>
          </button>`;
        } else {
          html += `<button class="slot-btn full" disabled>
            ${slot.time}
            <span class="slot-remaining">満</span>
          </button>`;
        }
      }
      html += '</div></div>';
    }
    container.innerHTML = html;

    container.querySelectorAll('.slot-btn:not(.full)').forEach(el => {
      el.addEventListener('click', () => {
        container.querySelectorAll('.slot-btn').forEach(b => b.classList.remove('selected'));
        el.classList.add('selected');
        state.time = el.dataset.time;

        document.getElementById('selected-info-2').innerHTML =
          `&#x1f4c5; ${formatDateJP(todayDate)} ${state.time}〜 ／ <span class="menu-badge general">診察予約</span>`;
        goTo(2);
      });
    });
  }

  // ---- Step 2: フォーム ----
  function onFormSubmit(e) {
    e.preventDefault();
    if (!validateForm()) return;

    state.patient = {
      childName: document.getElementById('f-child-name').value.trim(),
      furigana: document.getElementById('f-furigana').value.trim(),
      birthDate: document.getElementById('f-birthdate').value,
      phone: document.getElementById('f-phone').value.trim(),
      email: document.getElementById('f-email').value.trim(),
      cardNumber: document.getElementById('f-card-number').value.trim(),
      hasFever: document.querySelector('input[name="fever"]:checked')?.value || '',
      notes: document.getElementById('f-notes').value.trim()
    };

    renderConfirmation();
    goTo(3);
  }

  function validateForm() {
    let valid = true;
    const checks = [
      { id: 'f-furigana', err: 'err-furigana' },
      { id: 'f-birthdate', err: 'err-birthdate' },
      { id: 'f-phone', err: 'err-phone' },
      { id: 'f-email', err: 'err-email' }
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
    const feverErr = document.getElementById('err-fever');
    if (!document.querySelector('input[name="fever"]:checked')) {
      feverErr.classList.add('show');
      valid = false;
    } else {
      feverErr.classList.remove('show');
    }

    return valid;
  }

  // ---- Step 3: 確認 ----
  function renderConfirmation() {
    const html = buildDetailHTML(state);
    document.getElementById('confirm-details').innerHTML = html;
  }

  function buildDetailHTML(data) {
    let rows = `
      <div class="confirm-row">
        <div class="confirm-label">予約日</div>
        <div class="confirm-value">${formatDateJP(todayDate)}</div>
      </div>
      <div class="confirm-row">
        <div class="confirm-label">時間</div>
        <div class="confirm-value">${data.time}〜</div>
      </div>
      <div class="confirm-row">
        <div class="confirm-label">メニュー</div>
        <div class="confirm-value"><span class="menu-badge general">診察予約</span></div>
      </div>`;

    if (data.patient.childName) {
      rows += `<div class="confirm-row">
        <div class="confirm-label">お子さまの名前</div>
        <div class="confirm-value">${escapeHTML(data.patient.childName)}</div>
      </div>`;
    }

    rows += `
      <div class="confirm-row">
        <div class="confirm-label">ふりがな</div>
        <div class="confirm-value">${escapeHTML(data.patient.furigana)}</div>
      </div>
      <div class="confirm-row">
        <div class="confirm-label">生年月日</div>
        <div class="confirm-value">${data.patient.birthDate}</div>
      </div>
      <div class="confirm-row">
        <div class="confirm-label">電話番号</div>
        <div class="confirm-value">${escapeHTML(data.patient.phone)}</div>
      </div>
      <div class="confirm-row">
        <div class="confirm-label">メール</div>
        <div class="confirm-value">${escapeHTML(data.patient.email)}</div>
      </div>`;

    if (data.patient.cardNumber) {
      rows += `<div class="confirm-row">
        <div class="confirm-label">診察券番号</div>
        <div class="confirm-value">${escapeHTML(data.patient.cardNumber)}</div>
      </div>`;
    }

    rows += `<div class="confirm-row">
      <div class="confirm-label">発熱</div>
      <div class="confirm-value" style="color:${data.patient.hasFever === 'yes' ? 'var(--color-danger)' : 'var(--color-green)'}; font-weight:700">
        ${data.patient.hasFever === 'yes' ? 'あり' : 'なし'}
      </div>
    </div>`;

    if (data.patient.notes) {
      rows += `<div class="confirm-row">
        <div class="confirm-label">症状・備考</div>
        <div class="confirm-value">${escapeHTML(data.patient.notes)}</div>
      </div>`;
    }

    return rows;
  }

  // ---- Step 4: 予約確定 ----
  function submit() {
    const reservation = addReservation({
      date: todayDate,
      time: state.time,
      menu: 'general',
      menuLabel: '診察予約',
      source: 'patient',
      patient: state.patient
    });

    document.getElementById('result-id').textContent = reservation.id;
    document.getElementById('result-details').innerHTML = buildDetailHTML(state);

    // メール送信
    EmailService.sendConfirmation(reservation);

    goTo(4);
  }

  // ---- 再開 ----
  function restart() {
    state = { time: null, patient: {} };
    document.getElementById('patient-form').reset();
    document.querySelectorAll('.form-error').forEach(e => e.classList.remove('show'));
    document.querySelectorAll('.form-input, .form-textarea').forEach(e => e.classList.remove('error'));
    renderTimeSlots();
    goTo(1);
  }

  document.addEventListener('DOMContentLoaded', init);

  return { goTo, submit, restart, confirmCancel };
})();
