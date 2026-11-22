// カメラ角度（DEV-PAPER-001 rev3）：?cam=1 の調整パネルの値の決め方と、作者が決めた角度がマップに入っていること
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { overrideFromParams, effectiveCam, CAM_LIMITS, CAM_DEFAULTS } from '../src/ui/cam-panel.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));

test('URL の pitch・fov：無い・数でないものは上書きしない、範囲外は範囲に収める', () => {
  assert.deepEqual(overrideFromParams(new URLSearchParams('cam=1')), {});
  assert.deepEqual(overrideFromParams(new URLSearchParams('cam=1&pitch=abc&fov=')), {});
  assert.deepEqual(overrideFromParams(new URLSearchParams('cam=1&pitch=15&fov=20')), { pitchDeg: 15, fovDeg: 20 });
  assert.deepEqual(overrideFromParams(new URLSearchParams('pitch=1&fov=999')), { pitchDeg: CAM_LIMITS.pitch[0], fovDeg: CAM_LIMITS.fov[1] });
});

test('いまの値：上書き → マップ → 既定の順（?cam=1 で開いただけではマップの値のまま）', () => {
  const map = { pitchDeg: 20, fovDeg: 24 };
  assert.deepEqual(effectiveCam({}, map), { pitchDeg: 20, fovDeg: 24, distance: 9, overridden: false });
  assert.deepEqual(effectiveCam({ pitchDeg: 15 }, map), { pitchDeg: 15, fovDeg: 24, distance: 9, overridden: true });
  assert.deepEqual(effectiveCam(undefined, undefined), { pitchDeg: CAM_DEFAULTS.pitchDeg, fovDeg: CAM_DEFAULTS.fovDeg, distance: 9, overridden: false });
});

test('paper-stage.js の既定値とパネルの既定値が同じ', () => {
  const src = fs.readFileSync(path.join(root, 'src/render/paper-stage.js'), 'utf8');
  assert.ok(src.includes(`cfg.pitchDeg ?? ${CAM_DEFAULTS.pitchDeg},`), 'pitch の既定');
  assert.ok(src.includes(`cfg.fovDeg ?? ${CAM_DEFAULTS.fovDeg};`), 'fov の既定');
});

test('作者の決定（2026-11-22 13:20ごろ）：すべてのマップの見下ろす角度は床から10度・画角60度、パネルの範囲に入る', () => {
  const world = readJson('data/world.json');
  const ids = (world.maps || []).map((m) => (typeof m === 'string' ? m : m.id));
  assert.ok(ids.length >= 2, '一覧からマップを読めること');
  for (const id of ids) {
    const m = readJson(`data/maps/${id}.json`);
    const c = m.stage?.camera;
    assert.ok(c, `${id}: stage.camera がある`);
    assert.equal(c.pitchDeg, 10, `${id}: pitchDeg`);
    assert.equal(c.fovDeg, 60, `${id}: fovDeg`);
    assert.ok(c.fovDeg >= CAM_LIMITS.fov[0] && c.fovDeg <= CAM_LIMITS.fov[1], `${id}: fovDeg ${c.fovDeg}`);
    assert.ok(c.pitchDeg >= CAM_LIMITS.pitch[0] && c.pitchDeg <= CAM_LIMITS.pitch[1]);
  }
});
