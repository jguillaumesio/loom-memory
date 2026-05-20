import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { replaceSection, sectionMarkers } from '../src/utils/wiki-section.js';
import { affectedZones, zoneSectionId } from '../src/commands/update.js';

test('replaceSection appends and then surgically replaces a managed section', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'loom-section-'));
  const file = path.join(dir, '01-Architecture-Stack.md');
  fs.writeFileSync(file, '# Architecture\n\nHuman note.\n', 'utf8');

  const first = replaceSection(file, 'zone-apps-api', 'First generated section.', { title: 'Zone: apps/api' });
  assert.equal(first, 'appended');

  const afterAppend = fs.readFileSync(file, 'utf8');
  const markers = sectionMarkers('zone-apps-api');
  assert.match(afterAppend, /Human note/);
  assert.match(afterAppend, new RegExp(markers.start));
  assert.match(afterAppend, /First generated section/);

  const second = replaceSection(file, 'zone-apps-api', 'Second generated section.', { title: 'Zone: apps/api' });
  assert.equal(second, 'replaced');

  const afterReplace = fs.readFileSync(file, 'utf8');
  assert.match(afterReplace, /Human note/);
  assert.doesNotMatch(afterReplace, /First generated section/);
  assert.match(afterReplace, /Second generated section/);
  assert.equal(afterReplace.match(new RegExp(markers.start, 'g')).length, 1);
});

test('affectedZones maps changed files to configured zones', () => {
  const zones = [
    { name: 'apps/api', path: 'apps/api' },
    { name: 'apps/admin', path: 'apps/admin' },
    { name: 'packages/models', path: 'packages/models' },
  ];

  assert.deepEqual(
    affectedZones(['apps/api/src/server.ts', 'README.md'], zones).map((zone) => zone.name),
    ['apps/api']
  );
  assert.deepEqual(
    affectedZones(['*'], zones).map((zone) => zone.name),
    ['apps/api', 'apps/admin', 'packages/models']
  );
  assert.equal(zoneSectionId('packages/models'), 'zone-packages-models');
});
