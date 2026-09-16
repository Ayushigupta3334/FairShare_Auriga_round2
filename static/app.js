(function () {
  const el = {
    poolName: document.getElementById('poolName'),
    target: document.getElementById('target'),
    organiser: document.getElementById('organiser'),
    memberName: document.getElementById('memberName'),
    addMemberBtn: document.getElementById('addMemberBtn'),
    memberChips: document.getElementById('memberChips'),
    memberEmptyNote: document.getElementById('memberEmptyNote'),
    shareNote: document.getElementById('shareNote'),
    statCollected: document.getElementById('statCollected'),
    statCollectedSub: document.getElementById('statCollectedSub'),
    statRemaining: document.getElementById('statRemaining'),
    statRemainingSub: document.getElementById('statRemainingSub'),
    statShare: document.getElementById('statShare'),
    statShareSub: document.getElementById('statShareSub'),
    progressFill: document.getElementById('progressFill'),
    payMember: document.getElementById('payMember'),
    payAmount: document.getElementById('payAmount'),
    payNote: document.getElementById('payNote'),
    addPaymentBtn: document.getElementById('addPaymentBtn'),
    txBody: document.getElementById('txBody'),
    txEmptyNote: document.getElementById('txEmptyNote'),
    summaryBody: document.getElementById('summaryBody'),
    summaryEmptyNote: document.getElementById('summaryEmptyNote'),
    slipList: document.getElementById('slipList'),
    resetBtn: document.getElementById('resetBtn'),
  };

  function rupee(n) {
    const v = Math.round((n + Number.EPSILON) * 100) / 100;
    const sign = v < 0 ? '-' : '';
    const abs = Math.abs(v);
    const formatted = abs.toLocaleString('en-IN', {
      maximumFractionDigits: 2,
      minimumFractionDigits: abs % 1 === 0 ? 0 : 2,
    });
    return sign + '₹' + formatted;
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  async function api(path, options) {
    const res = await fetch(path, options);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Request failed (${res.status})`);
    }
    return res.status === 204 ? null : res.json();
  }

  let debounceTimer = null;
  function saveSettingsDebounced() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      try {
        await api('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pool_name: el.poolName.value,
            target: parseFloat(el.target.value) || 0,
            organiser: el.organiser.value,
          }),
        });
        await refresh();
      } catch (e) {
        console.error('Could not save settings:', e);
      }
    }, 400);
  }
  el.poolName.addEventListener('input', saveSettingsDebounced);
  el.target.addEventListener('input', saveSettingsDebounced);
  el.organiser.addEventListener('input', saveSettingsDebounced);

  async function addMember() {
    const name = el.memberName.value.trim();
    if (!name) return;
    try {
      await api('/api/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      el.memberName.value = '';
      await refresh();
      el.memberName.focus();
    } catch (e) {
      alert(e.message);
    }
  }
  el.addMemberBtn.addEventListener('click', addMember);
  el.memberName.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addMember(); } });

  async function removeMember(id) {
    await api(`/api/members/${id}`, { method: 'DELETE' });
    await refresh();
  }

  async function addPayment() {
    const memberId = el.payMember.value;
    const amount = parseFloat(el.payAmount.value);
    if (!memberId || !amount || amount <= 0) return;
    try {
      await api('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ member_id: Number(memberId), amount, note: el.payNote.value.trim() }),
      });
      el.payAmount.value = '';
      el.payNote.value = '';
      await refresh();
      el.payAmount.focus();
    } catch (e) {
      alert(e.message);
    }
  }
  el.addPaymentBtn.addEventListener('click', addPayment);
  [el.payAmount, el.payNote].forEach((input) =>
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addPayment(); } })
  );

  async function removePayment(id) {
    await api(`/api/payments/${id}`, { method: 'DELETE' });
    await refresh();
  }

  el.resetBtn.addEventListener('click', async () => {
    if (!confirm('Clear every member and transaction? This cannot be undone.')) return;
    await api('/api/reset', { method: 'POST' });
    await refresh();
  });

  function render(state) {
    const { settings, members, payments, balances, status, settlement } = state;
    const n = members.length;

    if (document.activeElement !== el.poolName) el.poolName.value = settings.pool_name;
    if (document.activeElement !== el.target) el.target.value = settings.target || '';
    if (document.activeElement !== el.organiser) el.organiser.value = settings.organiser;

    const fairShare = n > 0 ? settings.target / n : 0;

    el.memberChips.innerHTML = '';
    el.memberEmptyNote.style.display = n ? 'none' : 'block';
    members.forEach((m) => {
      const chip = document.createElement('div');
      chip.className = 'chip';
      chip.innerHTML = `<span>${escapeHtml(m.name)}</span>`;
      const btn = document.createElement('button');
      btn.textContent = '×';
      btn.title = 'Remove ' + m.name;
      btn.addEventListener('click', () => removeMember(m.id));
      chip.appendChild(btn);
      el.memberChips.appendChild(chip);
    });
    el.shareNote.textContent = n
      ? `— ${rupee(fairShare)} / head across ${n} ${n === 1 ? 'person' : 'people'}`
      : '— add names to set the share';

    const prevSelected = el.payMember.value;
    el.payMember.innerHTML =
      '<option value="" disabled selected>Choose name</option>' +
      members.map((m) => `<option value="${m.id}">${escapeHtml(m.name)}</option>`).join('');
    if (members.some((m) => String(m.id) === prevSelected)) el.payMember.value = prevSelected;

    el.statCollected.textContent = rupee(status.collected);
    el.statCollectedSub.textContent = `of ${rupee(status.target)} target`;
    el.statRemaining.textContent = rupee(status.remaining);
    el.statRemainingSub.textContent =
      status.remaining > 0.01 ? 'keep collecting' : status.surplus > 0.01 ? `fully collected · ${rupee(status.surplus)} extra in the pool` : 'fully collected';
    el.statShare.textContent = rupee(fairShare);
    el.statShareSub.textContent = n ? `${n} ${n === 1 ? 'person' : 'people'} splitting equally` : 'no one added yet';
    el.progressFill.style.width = status.percent + '%';

    el.txBody.innerHTML = '';
    el.txEmptyNote.style.display = payments.length ? 'none' : 'block';
    payments.forEach((p, idx) => {
      const member = members.find((m) => m.id === p.member_id);
      const name = member ? member.name : '(removed)';
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${idx + 1}</td>
        <td>${escapeHtml(name)}${p.note ? ' <span style="color:var(--ink-soft); font-size:12px;">— ' + escapeHtml(p.note) + '</span>' : ''}</td>
        <td class="num">${rupee(p.amount)}</td>
        <td class="del-cell"><button title="Remove entry" data-id="${p.id}">×</button></td>
      `;
      el.txBody.appendChild(tr);
    });
    el.txBody.querySelectorAll('button[data-id]').forEach((btn) =>
      btn.addEventListener('click', () => removePayment(btn.getAttribute('data-id')))
    );

    el.summaryBody.innerHTML = '';
    el.summaryEmptyNote.style.display = n ? 'none' : 'block';
    balances.forEach((b) => {
      const tr = document.createElement('tr');
      let tagClass = 'even', tagText = 'settled';
      if (b.balance > 0.01) { tagClass = 'credit'; tagText = 'is owed ' + rupee(b.balance); }
      else if (b.balance < -0.01) { tagClass = 'owes'; tagText = 'owes ' + rupee(-b.balance); }
      tr.innerHTML = `
        <td>${escapeHtml(b.name)}</td>
        <td class="num">${rupee(b.fair_share)}</td>
        <td class="num">${rupee(b.paid)}</td>
        <td><span class="balance-tag ${tagClass}">${tagText}</span></td>
      `;
      el.summaryBody.appendChild(tr);
    });

    el.slipList.innerHTML = '';
    if (n === 0) {
      el.slipList.innerHTML = '<p class="empty-note">Add account holders to generate settlement instructions.</p>';
    } else if (settlement.length === 0) {
      el.slipList.innerHTML = '<div class="all-settled">Every account is settled. Nothing more to transfer.</div>';
    } else {
      settlement.forEach((t) => {
        const div = document.createElement('div');
        div.className = 'slip';
        div.innerHTML = `<div class="who"><b>${escapeHtml(t.from_name)}</b> pays <b>${escapeHtml(t.to_name)}</b></div><div class="amt">${rupee(t.amount)}</div>`;
        el.slipList.appendChild(div);
      });
    }
  }

  async function refresh() {
    try {
      const state = await api('/api/state');
      render(state);
    } catch (e) {
      console.error('Could not load passbook state:', e);
    }
  }

  refresh();
})();
