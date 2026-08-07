import assert from "node:assert/strict";
import test from "node:test";

import { OperationFeedback } from "../modules/operation-feedback.js";

test("Operation feedback starts an unknown directory read without inventing progress", () => {
  const feedback = new OperationFeedback();

  assert.deepEqual(
    feedback.start({
      kind: "scan",
      title: "正在读取照片文件夹",
      detail: "照片只会在你的电脑上处理。",
    }),
    {
      kind: "scan",
      mode: "indeterminate",
      title: "正在读取照片文件夹",
      detail: "照片只会在你的电脑上处理。",
      completed: null,
      total: null,
      value: null,
      isBusy: true,
    },
  );
});

test("Operation feedback gives photo analysis an honest determinate count after its total is known", () => {
  const feedback = new OperationFeedback();

  feedback.start({ kind: "scan", title: "正在读取照片文件夹" });
  const state = feedback.progress({
    kind: "analysis",
    title: "正在分析照片",
    completed: 2,
    total: 5,
    detail: "已分析 2 / 5 个 photo group",
  });

  assert.deepEqual(state, {
    kind: "analysis",
    mode: "determinate",
    title: "正在分析照片",
    detail: "已分析 2 / 5 个 photo group",
    completed: 2,
    total: 5,
    value: 40,
    isBusy: true,
  });
});

test("Operation feedback finishes and fails without preserving a misleading busy state", () => {
  const feedback = new OperationFeedback();

  feedback.progress({
    kind: "move",
    title: "正在移动 photo group",
    completed: 3,
    total: 3,
    detail: "已完成 3 / 3 个 photo group",
  });
  assert.deepEqual(
    feedback.complete({
      kind: "move",
      title: "已移动到可恢复 review batch",
      detail: "可随时从已移动列表恢复。",
    }),
    {
      kind: "move",
      mode: "success",
      title: "已移动到可恢复 review batch",
      detail: "可随时从已移动列表恢复。",
      completed: 3,
      total: 3,
      value: 100,
      isBusy: false,
    },
  );
  assert.deepEqual(
    feedback.fail({
      kind: "restore",
      title: "无法恢复 review batch",
      detail: "源目录已存在同名文件。",
    }),
    {
      kind: "restore",
      mode: "error",
      title: "无法恢复 review batch",
      detail: "源目录已存在同名文件。",
      completed: null,
      total: null,
      value: null,
      isBusy: false,
    },
  );
});
