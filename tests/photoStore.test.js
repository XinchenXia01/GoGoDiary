/**
 * 照片能力测试（新增）
 * 覆盖：photoStore 的 IndexedDB 封装 + storage.js 的图片导入导出 / 连带清理 / 向后兼容。
 *
 * 关键策略：
 *   1) 先跑「无 IndexedDB 降级」用例 —— 此时全局尚未注入 fake-indexeddb，
 *      photoStore 因检测不到环境应 reject，而 storage.js 的 export/import/delete
 *      必须在内部 try/catch 兜住，正常 resolve（导出无图、导入带 photoWarning）。
 *   2) 再在嵌套 suite 内动态 import('fake-indexeddb/auto')，注入真实 IndexedDB 行为，
 *      验证 put/get 往返、批量、base64 编解码、storage 集成（导出含图、导入回写、删事件连带清理、老备份兼容）。
 *
 * 注意：Node 没有 FileReader（DOM API），下方为 blobToDataURL 提供最小实现。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { indexedDB as fakeIdb, IDBKeyRange as fakeIdbKeyRange } from 'fake-indexeddb';

import {
  blobToDataURL,
  compressImageFile,
  dataURLToBlob,
  deleteAllPhotos,
  deletePhoto,
  deletePhotosByIds,
  getAllPhotoBlobs,
  getPhoto,
  putPhoto,
  putPhotos,
} from '../src/lib/photoStore.js';
import {
  addEvent,
  addPet,
  deleteEvent,
  exportData,
  importData,
  readEvents,
  setStorageErrorListener,
} from '../src/lib/storage.js';
import { installDomEnv } from './helpers/dom-env.js';

// Node 没有 FileReader，给 blobToDataURL 提供最小实现（仅本测试环境，不影响 src）
if (typeof globalThis.FileReader === 'undefined') {
  globalThis.FileReader = class {
    readAsDataURL(blob) {
      Promise.resolve()
        .then(() => blob.arrayBuffer())
        .then((buf) => {
          this.result = `data:${blob.type || 'application/octet-stream'};base64,${Buffer.from(buf).toString('base64')}`;
          if (this.onload) this.onload();
        })
        .catch((err) => {
          if (this.onerror) this.onerror(err);
        });
    }
  };
}

/** 造一个小 Blob 用于往返比对 */
function makeBlob(text = 'petlog-test-bytes') {
  return new Blob([new TextEncoder().encode(text)], { type: 'image/png' });
}

/** 读取 Blob 文本（用于比对内容一致性） */
async function blobText(blob) {
  return blob ? blob.text() : null;
}

/* ===================================================================
 * 一、降级安全：没有 IndexedDB 的环境
 * =================================================================== */

test('photoStore: 无 indexedDB 时 putPhoto/getPhoto 应明确 reject（非 no-op）', async () => {
  await assert.rejects(() => putPhoto('x', makeBlob()), /IndexedDB|不可用/);
  await assert.rejects(() => getPhoto('x'), /IndexedDB|不可用/);
});

test('compressImageFile: 无 DOM 时应优雅 reject 而非崩溃', async () => {
  await assert.rejects(() => compressImageFile(makeBlob()), /无法处理图片|图片/);
});

test('storage.exportData: 无 indexedDB 时降级为「无图」并正常 resolve', async () => {
  installDomEnv();
  setStorageErrorListener(null);
  const pet = addPet({ name: '旺财', emoji: '🐶', kind: 'dog' });
  addEvent({ petId: pet.id, type: 'walk', ts: 1700000000000, photoIds: ['ph-x'] });
  const data = await exportData();
  assert.equal(data.app, 'petlog');
  assert.deepEqual(data.photos, {}, '无 IDB 时 photos 应降级为空对象，不抛异常');
});

test('storage.importData: 含 photos 的备份在无 IDB 时应给出 photoWarning 且不阻断主体导入', async () => {
  installDomEnv();
  setStorageErrorListener(null);
  const backup = {
    app: 'petlog',
    version: 1,
    pets: [{ id: 'p1', name: '旺财', emoji: '🐶', kind: 'dog', createdAt: 1 }],
    events: [{ id: 'e1', petId: 'p1', type: 'walk', ts: 1700000000000 }],
    photos: { ph1: 'data:image/png;base64,AAA' },
  };
  const r = await importData(JSON.stringify(backup), 'overwrite');
  assert.equal(r.ok, true, '主体导入应成功');
  assert.ok(r.photoWarning, `应给出图片恢复失败的提示，实际 photoWarning=${r.photoWarning}`);
  assert.equal(readEvents().length, 1, '事件应照常导入');
});

test('storage.deleteEvent: 无 IDB 时删除仍正常 resolve（图片清理被 catch 忽略）', async () => {
  installDomEnv();
  setStorageErrorListener(null);
  const pet = addPet({ name: '旺财', emoji: '🐶', kind: 'dog' });
  const evt = addEvent({ petId: pet.id, type: 'walk', ts: 1700000000000, photoIds: ['ph-x'] });
  const after = await deleteEvent(evt.id);
  assert.equal(after.length, 0, '事件应被删除');
});

/* ===================================================================
 * 二、真实 IndexedDB 行为（注入 fake-indexeddb/auto 后）
 * =================================================================== */
test('photoStore with IndexedDB (fake-indexeddb)', async (t) => {
  // 显式把 fake-indexeddb 挂到全局（比 /auto 的副作用更可靠，避免模块加载时序/并发问题）
  globalThis.indexedDB = fakeIdb;
  globalThis.IDBKeyRange = fakeIdbKeyRange;

  /** 每个子测试前清空图片库，保证互相独立 */
  async function resetIdb() {
    try {
      await deleteAllPhotos();
    } catch {
      /* 空库清空会失败也忽略 */
    }
    installDomEnv();
    setStorageErrorListener(null);
  }

  await t.test('putPhoto / getPhoto 往返：拿回内容一致的 Blob', async () => {
    await resetIdb();
    const blob = makeBlob('hello-photo-1');
    await putPhoto('id1', blob);
    const got = await getPhoto('id1');
    assert.ok(got instanceof Blob, 'getPhoto 应返回 Blob');
    assert.equal(await blobText(got), 'hello-photo-1', '内容应与原图一致');
  });

  await t.test('getPhoto: 不存在的 id 返回 null（不抛异常）', async () => {
    await resetIdb();
    assert.equal(await getPhoto('no-such-id'), null);
  });

  await t.test('putPhotos / getAllPhotoBlobs 批量往返一致', async () => {
    await resetIdb();
    const map = {
      a: makeBlob('aaa'),
      b: makeBlob('bbb'),
      c: makeBlob('ccc'),
    };
    await putPhotos(map);
    const all = await getAllPhotoBlobs();
    assert.equal(Object.keys(all).sort().join(','), 'a,b,c');
    assert.equal(await blobText(all.a), 'aaa');
    assert.equal(await blobText(all.b), 'bbb');
    assert.equal(await blobText(all.c), 'ccc');
  });

  await t.test('deletePhotosByIds: 批量删除后 getPhoto 返回 null', async () => {
    await resetIdb();
    await putPhotos({ d: makeBlob('ddd'), e: makeBlob('eee') });
    await deletePhotosByIds(['d', 'e']);
    assert.equal(await getPhoto('d'), null);
    assert.equal(await getPhoto('e'), null);
  });

  await t.test('deletePhoto: 单张删除后 getPhoto 返回 null', async () => {
    await resetIdb();
    await putPhoto('single', makeBlob('solo'));
    await deletePhoto('single');
    assert.equal(await getPhoto('single'), null);
  });

  await t.test('deleteAllPhotos: 清空后 getAllPhotoBlobs 为空', async () => {
    await resetIdb();
    await putPhotos({ x: makeBlob('x'), y: makeBlob('y') });
    await deleteAllPhotos();
    const all = await getAllPhotoBlobs();
    assert.deepEqual(all, {}, '清空后应无任何图片');
  });

  await t.test('blobToDataURL / dataURLToBlob 往返一致（含 dataURL 前缀）', async () => {
    await resetIdb();
    const blob = makeBlob('round-trip-bytes');
    const url = await blobToDataURL(blob);
    assert.ok(typeof url === 'string' && url.startsWith('data:'), `应是 dataURL，实际：${url}`);
    assert.ok(url.includes('base64'), 'dataURL 应含 base64');
    const back = dataURLToBlob(url);
    assert.ok(back instanceof Blob, 'dataURLToBlob 应返回 Blob');
    assert.equal(await blobText(back), 'round-trip-bytes', '往返内容应一致');
  });

  await t.test('dataURLToBlob: 空 / 非字符串输入返回空 Blob 而不抛', () => {
    const empty = dataURLToBlob('');
    assert.ok(empty instanceof Blob);
    const nonStr = dataURLToBlob(undefined);
    assert.ok(nonStr instanceof Blob);
  });

  await t.test('storage 集成：导出含 photos / 导入回写 IDB / 删事件连带清理 / 向后兼容', async () => {
    await resetIdb();

    const blob = makeBlob('integration-photo');
    await putPhoto('ph1', blob);

    const pet = addPet({ name: '旺财', emoji: '🐶', kind: 'dog' });
    const evt = addEvent({ petId: pet.id, type: 'walk', ts: 1700000000000, photoIds: ['ph1'] });

    // 1) 导出：photos 字段内联 base64
    const data = await exportData();
    assert.ok(data.photos && typeof data.photos === 'object', '导出应含 photos 字段');
    assert.ok(data.photos.ph1, 'photos 应含 ph1');
    assert.ok(
      data.photos.ph1.startsWith('data:'),
      `photos[ph1] 应是 dataURL，实际：${data.photos.ph1}`
    );
    const restored = dataURLToBlob(data.photos.ph1);
    assert.ok(restored instanceof Blob && restored.size > 0, 'dataURL 应能还原成 Blob');

    // 2) 导入（覆盖）应把图片写回 IndexedDB
    const r = await importData(JSON.stringify(data), 'overwrite');
    assert.equal(r.ok, true);
    const back = await getPhoto('ph1');
    assert.ok(back instanceof Blob, '导入后图片应回写进 IndexedDB');

    // 3) 删事件应连带清理图片
    await deleteEvent(evt.id);
    assert.equal(await getPhoto('ph1'), null, '删事件后对应图片应被连带清理');

    // 4) 向后兼容：没有 photos 字段的老备份（事件也无 photoIds）
    const oldBackup = {
      app: 'petlog',
      version: 1,
      pets: [{ id: 'p1', name: '旺财', emoji: '🐶', kind: 'dog', createdAt: 1 }],
      events: [{ id: 'e2', petId: 'p1', type: 'meal', ts: 1700000000000 }],
      settings: { activePetId: 'p1', timelineOrder: 'desc' },
    };
    const r2 = await importData(JSON.stringify(oldBackup), 'overwrite');
    assert.equal(r2.ok, true, '无 photos 字段的老备份应正常导入且不报错');
    assert.equal(r2.photoWarning, undefined, '无 photos 时不应有 photoWarning（向后兼容跳过）');
    const imported = readEvents().find((e) => e.id === 'e2');
    assert.ok(imported, '老备份的事件应被导入');
    assert.deepEqual(imported.photoIds, [], '老备份无图时 photoIds 应清洗为空数组');
  });
});
