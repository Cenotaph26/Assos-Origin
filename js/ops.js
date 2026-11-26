/* Origin takip — veri işlemleri.
   Aynı fonksiyon apps-script/Code.gs içinde de var: biri değişirse diğerini de güncelleyin. */
(function (root) {
  var STEP_F = ['t', 'who', 's', 'e', 'plan', 'act', 'st', 'note'];
  var MEET_F = ['title', 'date', 'start', 'end', 'place', 'who', 'phase', 'note'];
  function findPhase(S, id) { return S.phases.find(function (p) { return p.id === id; }); }
  function applyOp(S, op) {
    var p = op.p ? findPhase(S, op.p) : null, i;
    if (!S.meetings) S.meetings = [];
    switch (op.t) {
      case 'set':
        if (!p) return S;
        var x = p.steps.find(function (s) { return s.id === op.s; });
        if (x && STEP_F.indexOf(op.f) >= 0) x[op.f] = String(op.v == null ? '' : op.v);
        return S;
      case 'pname':
        if (p) p.name = String(op.v || 'Adsız aşama');
        return S;
      case 'addStep':
        if (!p || p.steps.some(function (s) { return s.id === op.step.id; })) return S;
        i = op.i == null ? p.steps.length : Math.max(0, Math.min(op.i, p.steps.length));
        p.steps.splice(i, 0, op.step);
        return S;
      case 'delStep':
        if (p) p.steps = p.steps.filter(function (s) { return s.id !== op.s; });
        return S;
      case 'addPhase':
        if (findPhase(S, op.phase.id)) return S;
        i = op.i == null ? S.phases.length : Math.max(0, Math.min(op.i, S.phases.length));
        S.phases.splice(i, 0, op.phase);
        return S;
      case 'delPhase':
        S.phases = S.phases.filter(function (q) { return q.id !== op.p; });
        return S;
      case 'move':
        if (!p) return S;
        i = S.phases.indexOf(p);
        var j = i + (op.d < 0 ? -1 : 1);
        if (j < 0 || j >= S.phases.length) return S;
        S.phases[i] = S.phases[j]; S.phases[j] = p;
        return S;
      case 'seed':
        if (!S.phases.length && op.phases && op.phases.length) S.phases = op.phases;
        return S;
      case 'madd':
        if (S.meetings.some(function (m) { return m.id === op.mt.id; })) return S;
        var nm = JSON.parse(JSON.stringify(op.mt)); nm.dirty = true;
        S.meetings.push(nm);
        return S;
      case 'mset':
        var m = S.meetings.find(function (z) { return z.id === op.m; });
        if (m && MEET_F.indexOf(op.f) >= 0) { m[op.f] = String(op.v == null ? '' : op.v); m.dirty = true; }
        return S;
      case 'mdel':
        S.meetings = S.meetings.filter(function (z) { return z.id !== op.m; });
        return S;
    }
    return S;
  }
  root.OriginOps = { applyOp: applyOp };
})(typeof window !== 'undefined' ? window : globalThis);
